// Постройки: башни 8 видов (каждый уровень выглядит иначе) и дома трёх стилей.
// Средневековые — модели KayKit, восточные (пагоды, минареты, дворцы) и северные — собраны из геометрии с PBR-текстурами.
import * as THREE from "three";
import { cloneWorld, cloneProp, cloneWeapon, cloneNature, hueMaterial, teamMaterial, makeChar, pbr } from "./assets.js";
import { makeBanner } from "./world.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const M = {};
function mats() {
  if (M.ready) return M;
  M.roof = pbr("roof", 1, { roughness: 0.7 });
  M.roofG = pbr("roofgrey", 1, { roughness: 0.75 });
  M.wood = pbr("cedar", 1, { roughness: 0.6 });
  M.plaster = pbr("plaster", 1, { roughness: 0.9 });
  M.sand = pbr("sandblock", 1, { roughness: 0.85, color: new THREE.Color().setRGB(3.3, 2.75, 2.0) });   // текстура почти угольная — подкрашиваем в песчаник
  M.mosaic = pbr("mosaic", 1, { roughness: 0.4, metalness: 0.1 });
  M.stone = pbr("stone", 1, { roughness: 0.9 });
  M.red = new THREE.MeshStandardMaterial({ color: 0xb8322a, roughness: 0.45, metalness: 0.05 });
  M.gold = new THREE.MeshStandardMaterial({ color: 0xffc35a, roughness: 0.28, metalness: 1, envMapIntensity: 1.4 });
  M.iron = new THREE.MeshStandardMaterial({ color: 0x3a3d44, roughness: 0.45, metalness: 0.8 });
  M.dark = new THREE.MeshStandardMaterial({ color: 0x2a1c14, roughness: 0.9 });
  M.ready = true; return M;
}
const glowMat = (c, k) => new THREE.MeshStandardMaterial({ color: 0x111111, emissive: new THREE.Color(c).multiplyScalar(k || 2.5), roughness: 0.3, toneMapped: false });
function setUV(geo, s) { const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * s, uv.getY(i) * s); return geo; }
const mesh = (g, m, x, y, z) => { const o = new THREE.Mesh(g, m); o.position.set(x || 0, y || 0, z || 0); o.castShadow = true; o.receiveShadow = true; return o; };
// радиальный профиль постройки (полосы по 10 см): наибольший радиус силуэта на высоте y и верхняя точка — к ним крепим знамёна, кольца, флажки, короны
const _pm = new THREE.Matrix4(), _pi = new THREE.Matrix4(), _pa = new THREE.Vector3(), _pb = new THREE.Vector3();
function profile(g, skip) {
  g.updateMatrixWorld(true); _pi.copy(g.matrixWorld).invert(); const P = new Float32Array(160), at = new THREE.Vector3(); let top = 0;
  const edge = (a, b) => { const n = Math.max(1, Math.ceil(Math.abs(b.y - a.y) * 20)); for (let k = 0; k <= n; k++) { const t = k / n, x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t, z = a.z + (b.z - a.z) * t, i = Math.max(0, Math.min(159, Math.floor(y * 10))); P[i] = Math.max(P[i], Math.hypot(x, z)); } };
  const walk = (o) => {
    if (skip && skip.has(o)) return;
    if (o.isMesh && o.visible) {
      _pm.multiplyMatrices(_pi, o.matrixWorld); const pa = o.geometry.attributes.position, ix = o.geometry.index, n = ix ? ix.count : pa.count, V = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
      for (let i = 0; i + 2 < n; i += 3) { for (let j = 0; j < 3; j++) { V[j].fromBufferAttribute(pa, ix ? ix.getX(i + j) : i + j).applyMatrix4(_pm); if (V[j].y > top) { top = V[j].y; at.copy(V[j]); } } edge(V[0], V[1]); edge(V[1], V[2]); edge(V[2], V[0]); }
    }
    o.children.forEach(walk);
  };
  walk(g);
  return { top, at, r: (y0, y1) => { let r = 0; for (let k = Math.max(0, Math.floor(y0 * 10)); k <= Math.min(159, Math.floor((y1 == null ? y0 : y1) * 10)); k++) r = Math.max(r, P[k]); return r; } };
}

// Изогнутая восточная крыша: квадратная пирамида с вогнутыми скатами и задранными углами
function pagodaRoof(w, h, curl) {
  const g = new THREE.ConeGeometry(w * Math.SQRT2, h, 4, 8, true); g.rotateY(Math.PI / 4); g.translate(0, h / 2, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), m = Math.max(Math.abs(x), Math.abs(z)) / w, c = Math.min(Math.abs(x), Math.abs(z)) / Math.max(1e-4, Math.max(Math.abs(x), Math.abs(z)));
    const t = y / h; let ny = y - Math.sin(Math.PI * t) * h * 0.18 + curl * Math.pow(m, 3) * c * c;
    p.setY(i, ny);
  }
  g.computeVertexNormals(); return setUV(g, 2.2);
}
function onionDome(r, h) {
  const pts = [];
  for (let i = 0; i <= 16; i++) { const t = i / 16, y = t * h; const rr = r * (Math.sin(Math.PI * Math.min(1, t * 1.25)) * (1 - t * 0.55) + (t < 0.1 ? 0.6 - t * 6 : 0)) ; pts.push(new THREE.Vector2(Math.max(0.02, t > 0.97 ? 0.02 : rr), y)); }
  pts[0].x = r * 0.75;
  const g = new THREE.LatheGeometry(pts, 20); return g;
}
function gable(w, d, h) { // двускатная крыша-призма
  const s = new THREE.Shape(); s.moveTo(-w / 2 - 0.15, 0); s.lineTo(w / 2 + 0.15, 0); s.lineTo(0, h); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: d + 0.3, bevelEnabled: false }); g.translate(0, 0, -(d + 0.3) / 2); return setUV(g, 0.5);
}

// ---------- Башни ----------
// возвращает { g, top:Vector3 (откуда летят снаряды), aim:Object3D|null, glow:[mat], fx:[{k, p:Vector3}] }
export function buildTower(type, lv, hue) {
  mats();
  const g = new THREE.Group(), out = { g, top: new THREE.Vector3(0, 3, 0), aim: null, glow: [], fx: [] };
  const kk = (name, s, hh, sat) => { const o = cloneWorld(name); const H2 = hh != null ? hh : hue; if (H2 != null) o.traverse((c) => { if (c.isMesh) c.material = hueMaterial(c.material, H2, sat); }); o.scale.setScalar(s); o.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } }); g.add(o); return o; };
  // настенные знамёна KayKit: древко торчит наружу (+x модели), полотнище висит под ним — крепим к стене по профилю башни, не внутрь
  const banners = (n, y, a0) => { const pf = profile(g), r = pf.r(y - 0.75, y + 0.05) - 0.03; for (let i = 0; i < n; i++) { const b = cloneProp(i % 2 ? "Banner_2" : "Banner_1"); b.scale.setScalar(0.55); const a = (a0 || 0) + i / n * Math.PI * 2; b.position.set(Math.cos(a) * r, y, Math.sin(a) * r); b.rotation.y = -a; g.add(b); } };
  const goldTop = (y, s) => { const o = mesh(new THREE.ConeGeometry(0.12 * s, 0.7 * s, 8), M.gold, 0, y + 0.35 * s, 0); g.add(o); const b = mesh(new THREE.SphereGeometry(0.16 * s, 12, 8), M.gold, 0, y, 0); g.add(b); };
  if (type === "arrow") {
    const big = lv >= 3; kk(big ? "building_tower_B_blue" : "building_tower_A_blue", big ? 1.75 + 0.08 * (lv - 3) : 1.75 + 0.1 * (lv - 1));
    out.top.set(0, big ? 3.9 : 3.4, 0);
    if (lv >= 2) banners(lv >= 4 ? 4 : 2, big ? 2.05 : 2.0, Math.PI / 4);
    if (lv >= 4) goldTop(4.5, 1);
  } else if (type === "cannon") {
    kk("building_tower_catapult_blue", 1.7 + 0.12 * (lv - 1));
    out.top.set(0, 2.9 + 0.2 * (lv - 1), 0);
    if (lv >= 3) { const r = mesh(new THREE.CylinderGeometry(1.25, 1.4, 0.5, 18), M.stone, 0, 0.25, 0); g.add(r); }
    if (lv >= 4) banners(3, 1.85 * (1.7 + 0.12 * (lv - 1)) / 1.7, Math.PI / 6);
  } else if (type === "ballista") {
    kk("building_tower_base_blue", 1.6 + 0.08 * (lv - 1));
    // поворотная площадка (aim, рысканье) и люлька с арбалетами (pitch, наклон к цели и отдача); модель арбалета смотрит вдоль +z
    const aim = new THREE.Group(); aim.position.y = 2.45 + 0.12 * (lv - 1); g.add(aim);
    const pitch = new THREE.Group(); pitch.position.y = 0.16; aim.add(pitch);
    const n = lv >= 3 ? 2 : 1, sc = n > 1 ? 0.92 + 0.06 * (lv - 3) : 1.15 + 0.12 * (lv - 1), dx = n > 1 ? 0.62 * sc + 0.05 : 0; out.tips = [];
    for (let i = 0; i < n; i++) {
      const c = cloneWeapon("crossbow_2handed"); c.scale.setScalar(sc); c.position.set(i ? dx : -dx, 0, -0.42 * sc); c.traverse((o) => { if (o.isMesh) o.castShadow = false; }); pitch.add(c);
      const tip = new THREE.Object3D(); tip.position.set(c.position.x, 0.07 * sc, c.position.z + 1.16 * sc); pitch.add(tip); out.tips.push(tip);   // кончик ложа — отсюда летит болт
    }
    if (n > 1) pitch.add(mesh(new THREE.BoxGeometry(dx * 2, 0.08, 0.12), M.wood, 0, -0.08, -0.1));   // общая ось двух арбалетов
    pitch.add(mesh(new THREE.BoxGeometry(0.16, 0.22, 0.16), M.wood, 0, -0.14, -0.1));
    const plat = mesh(new THREE.CylinderGeometry(0.7, 0.8, 0.18, 12), M.wood, 0, -0.05, 0); aim.add(plat);
    if (lv >= 4) { const r = mesh(new THREE.TorusGeometry(0.75, 0.06, 6, 24), M.gold, 0, 0.05, 0); r.rotation.x = Math.PI / 2; aim.add(r); }
    out.aim = aim; out.pitch = pitch; out.top.set(0, aim.position.y + 0.25, 0);
  } else if (type === "frost") {
    kk(lv >= 3 ? "building_tower_B_blue" : "building_tower_A_blue", 1.6 + 0.08 * (lv - 1), -0.08, 0.5);
    const cg = glowMat(0x7ad8ff, 1.4 + 0.5 * lv), cr = mesh(new THREE.OctahedronGeometry(0.28 + 0.07 * lv, 0), cg, 0, (lv >= 3 ? 4.6 : 4.0), 0);
    cr.scale.y = 1.6; g.add(cr); out.spin = cr; out.glow.push(cg); out.top.copy(cr.position);
    if (lv >= 2) for (let i = 0; i < lv; i++) { const s = mesh(new THREE.OctahedronGeometry(0.1, 0), cg, 0, cr.position.y, 0); s.userData.orbit = { r: 0.55, a: i / lv * Math.PI * 2 }; g.add(s); (out.orbs = out.orbs || []).push(s); }
  } else if (type === "minaret") {
    const H = 2.6 + 0.55 * (lv - 1), base = mesh(new THREE.CylinderGeometry(0.75, 0.9, 0.6, 16), M.sand, 0, 0.3, 0); g.add(base);
    const shaft = mesh(setUV(new THREE.CylinderGeometry(0.42, 0.55, H, 16), 1.5), M.sand, 0, 0.6 + H / 2, 0); g.add(shaft);
    const band = mesh(setUV(new THREE.CylinderGeometry(0.46, 0.46, 0.3, 16), 2), M.mosaic, 0, 0.6 + H * 0.45, 0); g.add(band);
    const balc = (y) => { const b = mesh(new THREE.CylinderGeometry(0.72, 0.5, 0.22, 16), M.sand, 0, y, 0); g.add(b); const rl = mesh(new THREE.TorusGeometry(0.66, 0.035, 6, 24), M.gold, 0, y + 0.22, 0); rl.rotation.x = Math.PI / 2; g.add(rl); };
    const top = 0.6 + H; balc(top - 0.1); if (lv >= 3) balc(0.6 + H * 0.62);
    const cab = mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.55, 12), M.plaster, 0, top + 0.27, 0); g.add(cab);
    const dome = mesh(onionDome(0.48, 1.0), lv >= 4 ? M.gold : M.mosaic, 0, top + 0.55, 0); g.add(dome);
    const sp = mesh(new THREE.ConeGeometry(0.05, 0.6, 6), M.gold, 0, top + 1.8, 0); g.add(sp);
    const gm = glowMat(0xb8a6ff, 1.5 + 0.6 * lv), orb = mesh(new THREE.SphereGeometry(0.16 + 0.03 * lv, 14, 10), gm, 0, top + 2.15, 0); g.add(orb);
    out.glow.push(gm); out.top.copy(orb.position); out.orb = orb;
  } else if (type === "fire") {
    const H = 1.6 + 0.45 * (lv - 1);
    const col = mesh(setUV(new THREE.CylinderGeometry(0.55, 0.85, H, 8), 1.2), M.sand, 0, H / 2, 0); g.add(col);
    for (let i = 0; i < Math.min(lv, 3); i++) { const r = mesh(new THREE.TorusGeometry(0.6 + 0.04 * i - 0.08 * i, 0.06, 6, 16), M.iron, 0, 0.4 + i * H / 3, 0); r.rotation.x = Math.PI / 2; g.add(r); }
    const c = cloneProp("Cauldron"); c.scale.setScalar(1.25 + 0.12 * lv); c.position.y = H; g.add(c);
    if (lv >= 4) { const s = mesh(new THREE.TorusGeometry(0.9, 0.05, 6, 24), M.gold, 0, H + 0.05, 0); s.rotation.x = Math.PI / 2; g.add(s); }
    const fm = glowMat(0xff7a1a, 2.2); const ember = mesh(new THREE.SphereGeometry(0.42, 14, 8), fm, 0, H + 0.42, 0); ember.scale.y = 0.35; g.add(ember); out.glow.push(fm);
    out.top.set(0, H + 0.9, 0); out.fx.push({ k: "fire", p: new THREE.Vector3(0, H + 0.55, 0), s: 0.8 + 0.15 * lv });
  } else if (type === "poison") {
    kk("building_tower_base_blue", 1.45 + 0.08 * (lv - 1), 0.75, 0.9);
    const y = 2.25 + 0.1 * (lv - 1), c = cloneProp("Cauldron"); c.scale.setScalar(1.2 + 0.12 * lv); c.position.y = y; g.add(c);
    const pm = glowMat(0x7dff4a, 1.6 + 0.4 * lv), s = mesh(new THREE.CircleGeometry(0.45 + 0.04 * lv, 16), pm, 0, y + 0.55, 0); s.rotation.x = -Math.PI / 2; g.add(s); out.glow.push(pm);
    if (lv >= 3) { const sk = cloneProp("Chain_Coil"); sk.scale.setScalar(1.2); sk.position.set(0.5, y - 0.6, 0.4); g.add(sk); }
    out.top.set(0, y + 0.8, 0); out.fx.push({ k: "poison", p: new THREE.Vector3(0, y + 0.6, 0), s: 0.7 + 0.15 * lv });
  } else if (type === "pagoda") {
    const tiers = lv; let y = 0;
    const base = mesh(setUV(new THREE.BoxGeometry(2.1, 0.35, 2.1), 1.5), M.stone, 0, 0.17, 0); g.add(base); y = 0.35;
    for (let t = 0; t < tiers; t++) {
      const w = 1.25 - t * 0.17, hgt = 0.9 - t * 0.08;
      const wall = mesh(setUV(new THREE.BoxGeometry(w * 1.3, hgt, w * 1.3), 1), M.plaster, 0, y + hgt / 2, 0); g.add(wall);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const c = mesh(new THREE.CylinderGeometry(0.07, 0.07, hgt, 6), M.red, sx * w * 0.68, y + hgt / 2, sz * w * 0.68); g.add(c); }
      const beam = mesh(new THREE.BoxGeometry(w * 1.42, 0.1, w * 1.42), M.red, 0, y + hgt, 0); g.add(beam);
      y += hgt;
      const roof = mesh(pagodaRoof(w * 1.05, 0.55, 0.32), M.roof, 0, y, 0); g.add(roof);
      y += 0.42;
    }
    goldTop(y + 0.1, 1 + 0.15 * lv); y += 0.5;
    if (lv >= 3) { const lantern = cloneProp("Lantern_Wall"); lantern.scale.setScalar(0.8); lantern.position.set(0.85, 0.9, 0.85); g.add(lantern); }
    const gm = glowMat(0xffc35a, 1 + 0.5 * lv); const gl = mesh(new THREE.SphereGeometry(0.1, 8, 6), gm, 0, y, 0); g.add(gl); out.glow.push(gm);
    out.top.set(0, y, 0);
  }
  return out;
}

// ---------- Дома ----------
// стили: medieval (KayKit), eastern (дворец с пагодами и куполами), nordic (бревенчатая усадьба)
const MED = [null, ["building_home_A_blue", 3.2], ["building_home_B_blue", 2.9], ["building_barracks_blue", 2.25], ["building_castle_blue", 1.55]];
export function buildHouse(style, lv, hue) {
  mats();
  const g = new THREE.Group(), out = { g, fx: [], h: 3 };
  if (style === "medieval" || !style) {
    const [n, s] = MED[lv]; const o = cloneWorld(n); o.traverse((c) => { if (c.isMesh) { c.material = hueMaterial(c.material, hue); c.castShadow = true; c.receiveShadow = true; } }); o.scale.setScalar(s); g.add(o);
    out.h = [0, 2.8, 3.4, 3.6, 6][lv];
    return out;
  }
  const flagM = hueMaterial(new THREE.MeshStandardMaterial({ color: 0x3b82f6, roughness: 0.6 }), hue);
  if (style === "eastern") {
    const base = mesh(setUV(new THREE.BoxGeometry(3.2 + 0.3 * lv, 0.4, 3.0 + 0.3 * lv), 2), M.sand, 0, 0.2, 0); g.add(base);
    const W = 2.1 + 0.2 * lv, D = 1.9 + 0.15 * lv, H = 1.3;
    const body = mesh(setUV(new THREE.BoxGeometry(W, H, D), 1), M.plaster, 0, 0.4 + H / 2, 0); g.add(body);
    const door = mesh(new THREE.PlaneGeometry(0.55, 0.85), M.dark, 0, 0.82, D / 2 + 0.01); g.add(door);
    const arch = mesh(new THREE.CircleGeometry(0.28, 12, 0, Math.PI), M.dark, 0, 1.24, D / 2 + 0.012); g.add(arch);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(mesh(new THREE.CylinderGeometry(0.08, 0.09, H, 8), M.red, sx * (W / 2 + 0.05), 0.4 + H / 2, sz * (D / 2 + 0.05)));
    const band = mesh(setUV(new THREE.BoxGeometry(W + 0.05, 0.18, D + 0.05), 2), M.mosaic, 0, 0.4 + H - 0.15, 0); g.add(band);
    let y = 0.4 + H;
    if (lv <= 2) {
      g.add(mesh(pagodaRoof(Math.max(W, D) * 0.68, 0.8, 0.4), M.roof, 0, y, 0)); y += 0.6;
      if (lv === 2) { const t2 = mesh(setUV(new THREE.BoxGeometry(W * 0.55, 0.7, D * 0.55), 1), M.plaster, 0, y + 0.35, 0); g.add(t2); y += 0.7; g.add(mesh(pagodaRoof(W * 0.42, 0.6, 0.3), M.roof, 0, y, 0)); y += 0.45; }
      g.add(mesh(new THREE.ConeGeometry(0.1, 0.5, 6), M.gold, 0, y + 0.25, 0));
    } else {
      // дворец: купол и минареты
      const drum = mesh(new THREE.CylinderGeometry(0.8, 0.85, 0.5, 16), M.plaster, 0, y + 0.25, 0); g.add(drum);
      g.add(mesh(onionDome(0.95, 1.7), lv >= 4 ? M.gold : M.mosaic, 0, y + 0.5, 0));
      g.add(mesh(new THREE.ConeGeometry(0.06, 0.6, 6), M.gold, 0, y + 2.4, 0));
      const mins = lv >= 4 ? 4 : 2;
      for (let i = 0; i < mins; i++) {
        const a = Math.PI / 4 + i * Math.PI * 2 / mins, x = Math.cos(a) * (W / 2 + 0.55), z = Math.sin(a) * (D / 2 + 0.55), mh = 2.6 + 0.5 * (lv - 3);
        g.add(mesh(setUV(new THREE.CylinderGeometry(0.2, 0.26, mh, 10), 1), M.sand, x, 0.4 + mh / 2, z));
        g.add(mesh(new THREE.CylinderGeometry(0.32, 0.22, 0.14, 10), M.sand, x, 0.4 + mh, z));
        g.add(mesh(onionDome(0.26, 0.55), M.gold, x, 0.47 + mh, z));
      }
      y += 2.4;
    }
    const pole = mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.6, 5), M.wood, -W / 2 - 0.3, 1.2, D / 2 + 0.3); g.add(pole);
    const fl = mesh(new THREE.PlaneGeometry(0.6, 0.38), flagM, -W / 2 - 0.0, 1.75, D / 2 + 0.3); fl.material.side = THREE.DoubleSide; g.add(fl); out.flag = fl;
    out.h = y + 0.6;
    if (lv >= 2) { const l = cloneProp("Lantern_Wall"); l.scale.setScalar(0.9); l.position.set(0.5, 1.3, D / 2 + 0.05); g.add(l); out.fx.push({ k: "lamp", p: new THREE.Vector3(0.5, 1.15, D / 2 + 0.3) }); }
    return out;
  }
  // северная усадьба
  const W = 2.2 + 0.25 * lv, D = 2.0 + 0.2 * lv, H = 1.25;
  const base = mesh(setUV(new THREE.BoxGeometry(W + 0.4, 0.3, D + 0.4), 1.5), M.stone, 0, 0.15, 0); g.add(base);
  const body = mesh(setUV(new THREE.BoxGeometry(W, H, D), 1.2), M.wood, 0, 0.3 + H / 2, 0); g.add(body);
  for (let i = 0; i < 4; i++) g.add(mesh(new THREE.BoxGeometry(W + 0.12, 0.08, 0.08), M.dark, 0, 0.45 + i * 0.3, D / 2 + 0.02));
  g.add(mesh(new THREE.PlaneGeometry(0.6, 0.9), M.dark, 0, 0.75, D / 2 + 0.05));
  let y = 0.3 + H;
  if (lv >= 3) { const up = mesh(setUV(new THREE.BoxGeometry(W * 0.9, 0.9, D * 0.9), 1.2), M.wood, 0, y + 0.45, 0); g.add(up); y += 0.9; }
  const roof = mesh(gable(W + 0.2, D, 1.2 + 0.1 * lv), M.roofG, 0, y, 0); g.add(roof); y += 1.2;
  const ch = mesh(setUV(new THREE.BoxGeometry(0.35, 1.0, 0.35), 1), M.stone, W * 0.25, y - 0.3, -D * 0.15); g.add(ch); out.fx.push({ k: "smoke", p: new THREE.Vector3(W * 0.25, y + 0.25, -D * 0.15) });
  if (lv >= 2) { const tw = mesh(setUV(new THREE.BoxGeometry(0.9, 2.4 + 0.4 * lv, 0.9), 1), M.wood, -W / 2 - 0.4, 1.2 + 0.2 * lv, -D / 2 + 0.3); g.add(tw); const tr = mesh(new THREE.ConeGeometry(0.85, 0.9, 4), M.roofG, -W / 2 - 0.4, 2.4 + 0.4 * lv + 0.4, -D / 2 + 0.3); tr.rotation.y = Math.PI / 4; g.add(tr); }
  if (lv >= 4) { for (const sx of [-1, 1]) { const b = cloneProp("Banner_1"); b.scale.setScalar(0.5); b.position.set(sx * (W / 2 - 0.3), 1.5, D / 2); b.rotation.y = -Math.PI / 2; g.add(b); } }   // настенные знамёна по краям фасада, древком наружу
  const pole = mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.6, 5), M.wood, W / 2 + 0.3, 1.1, D / 2 + 0.3); g.add(pole);
  const fl = mesh(new THREE.PlaneGeometry(0.6, 0.38), flagM, W / 2 + 0.6, 1.65, D / 2 + 0.3); fl.material.side = THREE.DoubleSide; g.add(fl); out.flag = fl;
  const l = cloneProp("Lantern_Wall"); l.scale.setScalar(0.9); l.position.set(-0.55, 1.2, D / 2 + 0.05); g.add(l); out.fx.push({ k: "lamp", p: new THREE.Vector3(-0.55, 1.05, D / 2 + 0.3) });
  out.h = y + 0.4;
  return out;
}
export { pagodaRoof, onionDome, mats as builderMats, M as BM };

// ---------- Глубокие уровни: замок растёт до 15, башни до 10 — каждый уровень заметен ----------
const goldRing = (r, y, t) => { mats(); const o = mesh(new THREE.TorusGeometry(r, t || 0.07, 6, 28), M.gold, 0, y, 0); o.rotation.x = Math.PI / 2; return o; };
function crown(y, s) {
  mats(); const g = new THREE.Group(); g.position.y = y;
  g.add(goldRing(0.38 * s, 0, 0.08 * s));
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2, sp = mesh(new THREE.ConeGeometry(0.08 * s, 0.32 * s, 5), M.gold, Math.cos(a) * 0.38 * s, 0.16 * s, Math.sin(a) * 0.38 * s); g.add(sp); }
  const gem = mesh(new THREE.OctahedronGeometry(0.16 * s, 0), glowMat(0xff4a6a, 3), 0, 0.3 * s, 0); g.add(gem);
  return g;
}
const auraRing = (r, col) => { const m = new THREE.Mesh(new THREE.RingGeometry(r * 0.82, r, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(1.6), transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })); m.position.y = 0.06; return m; };
export function buildHouseDeep(style, lv, hue) {
  const b = buildHouse(style, Math.min(4, lv), hue);
  if (lv <= 4) return bake(b);
  mats();
  const k = lv - 4, g = b.g;
  // угловые башенки (по одной на уровень, до четырёх), дальше — ярусы
  const corners = [[1, 1], [-1, 1], [1, -1], [-1, -1]], R = style === "medieval" || !style ? 1.75 : 1.95;
  for (let i = 0; i < Math.min(4, k); i++) {
    const [sx, sz] = corners[i], t = new THREE.Group(); t.position.set(sx * R, 0, sz * R);
    const tiers = 1 + Math.floor(Math.max(0, k - 4 - i) / 4);
    if (style === "eastern") {
      let y = 0; for (let j = 0; j < 1 + tiers; j++) { const w = 0.55 - j * 0.08; t.add(mesh(setUV(new THREE.BoxGeometry(w, 0.55, w), 1), M.plaster, 0, y + 0.27, 0)); y += 0.55; t.add(mesh(pagodaRoof(w * 0.95, 0.35, 0.25), M.roof, 0, y, 0)); y += 0.28; }
      t.add(mesh(new THREE.ConeGeometry(0.05, 0.3, 6), M.gold, 0, y + 0.15, 0));
    } else if (style === "nordic") {
      const h = 1.6 + 0.4 * tiers; t.add(mesh(setUV(new THREE.BoxGeometry(0.6, h, 0.6), 1), M.wood, 0, h / 2, 0)); t.add(mesh(new THREE.ConeGeometry(0.55, 0.7, 4), M.roofG, 0, h + 0.35, 0));
    } else {
      const o = cloneWorld("building_tower_A_blue"); o.traverse((c) => { if (c.isMesh) { c.material = hueMaterial(c.material, hue); c.castShadow = true; } }); o.scale.setScalar(0.85 + 0.12 * tiers); t.add(o);
    }
    g.add(t);
  }
  if (lv >= 7) g.add(goldRing(2.35, 0.12));                                   // золотая отделка
  if (lv >= 9) { const c = new THREE.Color(0x3b82f6), hsl = {}; c.getHSL(hsl); c.setHSL((hsl.h + hue + 1) % 1, hsl.s, hsl.l); for (const s2 of [-1, 1]) { const bn = makeBanner("#" + c.getHexString()); bn.scale.setScalar(0.8); bn.position.set(s2 * 0.95, 0, 2.05); g.add(bn); } }   // знамёна на шестах у входа
  if (lv >= 11) g.add(goldRing(2.6, 0.32, 0.05));
  if (lv >= 12) { g.add(auraRing(2.9, 0xffd34d)); }
  if (lv >= 13) { const pf = profile(g, new Set([b.flag].filter(Boolean))), top = pf.top, s = 1.2 + 0.1 * (lv - 13), c = crown(top - 0.12 * s, s); c.position.x = pf.at.x; c.position.z = pf.at.z; g.add(c); b.crown = c; b.h = Math.max(b.h, top + 0.5 * s); }   // корона садится на верхушку крыши
  g.scale.setScalar(1 + 0.025 * k);
  b.h *= 1 + 0.025 * k;
  return bake(b);
}
// корона-венец: золотой обод с зубцами вокруг карниза (радиус — по профилю постройки)
function coronet(r, y) {
  mats(); const g = new THREE.Group(); g.position.y = y; g.add(goldRing(r, 0, 0.06));
  const n = Math.max(6, Math.round(r * 9)); for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, sp = mesh(new THREE.ConeGeometry(0.07, i % 2 ? 0.2 : 0.3, 5), M.gold, Math.cos(a) * r, i % 2 ? 0.1 : 0.15, Math.sin(a) * r); g.add(sp); }
  for (let i = 0; i < 4; i++) { const a = (i + 0.5) / 4 * Math.PI * 2, gm = mesh(new THREE.OctahedronGeometry(0.075, 0), glowMat(0xff4a6a, 3), Math.cos(a) * (r + 0.05), 0.02, Math.sin(a) * (r + 0.05)); g.add(gm); }
  return g;
}
export function buildTowerDeep(type, lv, hue, trim) {
  const b = buildTower(type, Math.min(4, lv), hue);
  mats();
  const g = b.g;
  // всё навесное — по силуэту башни (без вращающихся/парящих частей): кольца обжимают корпус, флажок стоит на карнизе, венец — вокруг карниза
  const skip = new Set([b.spin, b.aim, b.orb, ...(b.orbs || [])].filter(Boolean)), pf = profile(g, skip), H = pf.top, ring = (y, t) => goldRing(pf.r(y - 0.06, y + 0.06) + 0.03, y, t);
  if (trim != null) { const tm = new THREE.MeshStandardMaterial({ color: trim, metalness: 0.6, roughness: 0.35 }), y = H * 0.45, r = mesh(new THREE.TorusGeometry(pf.r(y - 0.06, y + 0.06) + 0.03, 0.06, 6, 24), tm, 0, y, 0); r.rotation.x = Math.PI / 2; g.add(r); }
  if (lv <= 4) return bake(b);
  const k = lv - 4;
  let yE = H * 0.6, rE = 0; for (let y = H * 0.5; y <= H * 0.97; y += 0.05) { const r = pf.r(y); if (r >= rE) { rE = r; yE = y; } }   // карниз: самое широкое место верхней половины
  g.add(ring(H * 0.62));
  let flagTop = null;
  if (lv >= 6) {
    // флажок: у баллисты — на поворотной площадке позади арбалетов (крутится вместе с ней), у остальных — на краю карниза
    const host = b.aim || g, px = b.aim ? 0 : rE - 0.05, py = b.aim ? -0.02 : yE, pz = b.aim ? -0.62 : 0;
    const pole = mesh(new THREE.CylinderGeometry(0.025, 0.03, 1.0, 5), M.wood, px, py + 0.5, pz); host.add(pole);
    const fm = hueMaterial(new THREE.MeshStandardMaterial({ color: 0x3b82f6, roughness: 0.6, side: THREE.DoubleSide }), hue), fl = mesh(new THREE.PlaneGeometry(0.42, 0.26), fm, px + 0.22, py + 0.84, pz); host.add(fl);
    flagTop = { host, p: new THREE.Vector3(px, py + 1.0, pz) };
  }
  if (lv >= 7 && flagTop) { const gm = glowMat(0x7cd3ff, 2.2), cr = mesh(new THREE.OctahedronGeometry(0.13, 0), gm, flagTop.p.x, flagTop.p.y + 0.12, flagTop.p.z); flagTop.host.add(cr); b.glow.push(gm); b.orb = b.orb || cr; }   // навершие флажка
  if (lv >= 8) g.add(auraRing(pf.r(0, 0.3) + 0.35, 0x7cd3ff));
  if (lv >= 9) g.add(ring(H * 0.3, 0.05));
  if (lv >= 10) g.add(coronet(rE + 0.02, yE + 0.02));
  g.scale.setScalar(1 + 0.03 * k);
  b.top.y *= 1 + 0.03 * k;
  return bake(b);
}
// ---------- Добытчики: лесопилка, каменоломня, золотой рудник ----------
// Каждый — маленькая «рабочая сцена» (site, растёт с уровнем): лесопилка с пилой на раме режет бревно на чурбаки,
// в каменоломне рабочий с киркой откалывает блоки, а кран переносит их в штабель, из рудника по рельсам выезжает вагонетка с золотом.
// Анимация — out.anim(t, dt, emit): emit(вид, x, y, z) — частицы в мировых координатах (game.js рисует их своим fx).
// +z модели смотрит на дом. Всё анимированное без теней (карта теней статичная).
const ease = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const seg01 = (u, a, b) => ease((u - a) / (b - a));
const GMODEL = { saw: ["building_lumbermill_blue", 1.45], mine: ["building_mine_blue", 1.5] };
// места мелочей по уровням (координаты сцены): тачка, мешок, ящик, телега доставки, флажок, бочки, факелы
const GEXTRA = {
  saw: { barrow: [-1.4, 0.8, 0.5], sack: [-1.4, -0.2], crate: [-1.2, -0.95, 0.4], cart: [0.1, -1.3, 0], flag: [1.25, -1.0], barrels: [[-1.62, 0.25], [-1.55, -0.6]], torches: [[0.75, 1.35], [-0.75, 1.35]], ring: 2.0 },
  quarry: { barrow: [-1.4, 0.75, 0.6], sack: [-1.55, -0.2], crate: [-1.5, 0.25, 0.3], cart: [-0.35, 1.5, 0], flag: [-1.3, -1.05], barrels: [[1.62, -0.45], [1.78, 0.05]], torches: [[-1.3, 1.15], [0.65, 1.3]], ring: 1.95 },
  mine: { barrow: [-1.45, 1.1, 0.4], sack: [1.62, 1.05], crate: [1.3, 1.5, 0.3], cart: [1.75, -0.4, Math.PI / 2], flag: [-1.45, -1.2], barrels: [[-1.62, 0.25], [-1.58, -0.3]], torches: [[0.55, 1.45], [-0.55, 1.45]], ring: 2.0 }
};
const PILE = { saw: () => { const o = cloneWorld("resource_lumber"); o.rotation.y = Math.PI / 2; return o; }, mine: () => { const o = cloneProp("Coin_Pile_2"); o.scale.setScalar(2.2); return o; } };
const PILE_AT = { saw: [1.62, 1.28], mine: [0, 2.3] };
// скалы рудника в атласе KayKit почти белые: светлые серые пиксели приглушаем и чуть утепляем (дерево и синие детали не трогаем)
const rockTones = new Map();
function toneRock(m) {
  if (rockTones.has(m)) return rockTones.get(m);
  const t = m.clone(), base = m.onBeforeCompile;
  t.onBeforeCompile = (sh, r) => { if (base) base(sh, r); sh.fragmentShader = sh.fragmentShader.replace("#include <map_fragment>", "#include <map_fragment>\n { vec3 c = diffuseColor.rgb; float mx = max(max(c.r, c.g), c.b), mn = min(min(c.r, c.g), c.b); if (mx > 0.3 && mx - mn < 0.3 * mx) diffuseColor.rgb = c * vec3(0.66, 0.62, 0.56); }"); };
  t.customProgramCacheKey = () => "rock" + (m.customProgramCacheKey ? m.customProgramCacheKey() : "");
  rockTones.set(m, t); return t;
}
let _gm = null;
function gmats() {
  if (_gm) return _gm; mats();
  _gm = {
    steel: new THREE.MeshStandardMaterial({ color: 0xdfe5ec, roughness: 0.38, metalness: 0.45 }),          // полотно пилы — светлая сталь
    wood: pbr("cedar", 1, { color: 0x9c7c5e, roughness: 0.8 }),                                              // тёмное дерево верстака, крана, шпал (кедр без подкраски слишком рыжий)
    bark: pbr("cedar", 1, { color: 0x8a6446, roughness: 0.85 }), cut: new THREE.MeshStandardMaterial({ color: 0xe3c28e, roughness: 0.8 }),
    block: pbr("stone", 1, { color: 0xd8d2c4, roughness: 0.85 }), rope: new THREE.MeshStandardMaterial({ color: 0xb59a6a, roughness: 0.9 }),
    rail: new THREE.MeshStandardMaterial({ color: 0x6e7178, roughness: 0.4, metalness: 0.7 }), bucket: new THREE.MeshStandardMaterial({ color: 0x4a4d55, roughness: 0.5, metalness: 0.6, side: THREE.DoubleSide })
  };
  let rk = null; cloneNature("Rock_Medium_2").traverse((o) => { if (o.isMesh && !rk) rk = o.material; });
  _gm.rock = rk ? rk.clone() : M.stone; if (rk) _gm.rock.color = new THREE.Color(0.8, 0.76, 0.7);   // скала каменоломни чуть теплее и темнее валунов-ресурсов
  return _gm;
}
// кирка (по оси топора — чтобы хват в руке совпадал): рукоять + изогнутый клюв из двух конусов
let pickProto = null;
export function makePick() {
  if (!pickProto) {
    const axe = cloneWeapon("Axe_Bronze"); axe.updateMatrixWorld(true);
    const pts = []; axe.traverse((o) => { if (o.isMesh) { const pa = o.geometry.attributes.position, v = new THREE.Vector3(); for (let i = 0; i < pa.count; i++) pts.push(v.fromBufferAttribute(pa, i).applyMatrix4(o.matrixWorld).clone()); } });
    const bb = new THREE.Box3().setFromPoints(pts), sz = bb.getSize(new THREE.Vector3()), ax = sz.x > sz.y && sz.x > sz.z ? "x" : sz.y > sz.z ? "y" : "z";
    const others = ["x", "y", "z"].filter((k) => k !== ax), L = sz[ax], lo = bb.min[ax], hi = bb.max[ax];
    const spread = (sel) => { const b2 = new THREE.Box3(); pts.filter(sel).forEach((q) => b2.expandByPoint(q)); return b2.isEmpty() ? 0 : Math.max(...others.map((k) => b2.max[k] - b2.min[k])); };
    const headHi = spread((q) => q[ax] > hi - L * 0.3) >= spread((q) => q[ax] < lo + L * 0.3);
    const hb = new THREE.Box3(); pts.filter((q) => headHi ? q[ax] > hi - L * 0.3 : q[ax] < lo + L * 0.3).forEach((q) => hb.expandByPoint(q));
    const bl = (hb.max[others[0]] - hb.min[others[0]]) >= (hb.max[others[1]] - hb.min[others[1]]) ? others[0] : others[1];
    const c = bb.getCenter(new THREE.Vector3()), up = new THREE.Vector3(), side = new THREE.Vector3(); up[ax] = headHi ? 1 : -1; side[bl] = 1;
    const wood = new THREE.MeshStandardMaterial({ color: 0x8a5a32, roughness: 0.8 }), iron = new THREE.MeshStandardMaterial({ color: 0x8d949c, roughness: 0.45, metalness: 0.6 });
    const g = new THREE.Group(), r = L * 0.035;
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.15, L * 0.98, 8), wood);
    handle.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up); handle.position.copy(c); g.add(handle);
    const top = c.clone().addScaledVector(up, L * 0.42);
    const hub = new THREE.Mesh(new THREE.BoxGeometry(r * 3.2, r * 3.2, r * 3.2), iron); hub.position.copy(top); hub.quaternion.copy(handle.quaternion); g.add(hub);
    for (const sg of [1, -1]) {
      const len = L * (sg > 0 ? 0.34 : 0.26), cone = new THREE.Mesh(new THREE.ConeGeometry(r * 1.5, len, 6), iron);
      const dir = side.clone().multiplyScalar(sg).addScaledVector(up, -0.28).normalize();
      cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir); cone.position.copy(top).addScaledVector(dir, len * 0.5 + r * 1.2); g.add(cone);
    }
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    pickProto = g;
  }
  const w = new THREE.Group(), k = pickProto.clone(); w.add(k);
  w.rotation.set(Math.PI / 2, 0, 0); w.scale.setScalar(0.9);
  return w;
}
const _wv = new THREE.Vector3();
const wpos = (o, x, y, z) => o.localToWorld(_wv.set(x, y, z));
const noShadow = (o) => { o.traverse((c) => { if (c.isMesh) { c.castShadow = false; c.userData.nobake = 1; } }); return o; };

// лесопилка: верстак, на нём бревно; маятниковая пила с вращающимся диском опускается и отрезает чурбак, тот падает в штабель
function sawWork(site, out) {
  const m = gmats(), B = new THREE.Group(); B.position.set(1.66, 0, 0.12); B.rotation.y = -Math.PI / 2; B.scale.setScalar(1.2); site.add(B);   // ось верстака (бревна) — вдоль +z сцены
  const add = (geo, mat, x, y, z, p) => { const o = mesh(geo, mat, x, y, z); (p || B).add(o); return o; };
  for (const x of [-0.62, 0.62]) for (const z of [-0.16, 0.16]) add(new THREE.BoxGeometry(0.07, 0.5, 0.07), m.wood, x, 0.25, z);
  add(new THREE.BoxGeometry(1.3, 0.05, 0.05), m.wood, 0, 0.14, 0.16); add(new THREE.BoxGeometry(1.3, 0.05, 0.05), m.wood, 0, 0.14, -0.16);
  add(new THREE.BoxGeometry(1.08, 0.06, 0.42), m.wood, -0.2, 0.5, 0); add(new THREE.BoxGeometry(0.34, 0.06, 0.42), m.wood, 0.58, 0.5, 0);   // столешница с прорезью под диск (x = 0.38)
  add(new THREE.BoxGeometry(0.1, 0.98, 0.1), m.wood, 0.38, 0.49, -0.38); add(new THREE.BoxGeometry(0.3, 0.06, 0.1), m.wood, 0.38, 0.03, -0.38);   // стойка пилы
  const CUT = 0.38, LS = 0.25, LR = 0.1, LY = 0.53 + LR;
  // маятник: ось на стойке, балка к диску; диск в плоскости yz, вращается вокруг x
  const arm = new THREE.Group(); arm.position.set(CUT, 0.95, -0.38); B.add(arm);
  add(new THREE.BoxGeometry(0.06, 0.07, 0.62), m.wood, 0.06, -0.225, 0.19, arm).rotation.x = 0.87;
  add(new THREE.CylinderGeometry(0.07, 0.07, 0.12, 10).rotateZ(Math.PI / 2), M.iron, 0.08, 0, 0, arm);   // ось маятника
  const blade = new THREE.Group(); blade.position.set(0, -0.45, 0.38); arm.add(blade);
  const disc = mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.025, 28), m.steel); disc.rotation.z = Math.PI / 2; blade.add(disc);
  for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2, t = mesh(new THREE.ConeGeometry(0.028, 0.06, 3), m.steel, 0, Math.cos(a) * 0.265, Math.sin(a) * 0.265); t.rotation.x = a; blade.add(t); }
  const hub = mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.06, 10), M.iron); hub.rotation.z = Math.PI / 2; blade.add(hub);
  // бревно из трёх чурбаков
  const logs = [], logG = new THREE.CylinderGeometry(LR, LR, LS - 0.006, 10).rotateZ(Math.PI / 2), capG = new THREE.CircleGeometry(LR * 0.9, 10).rotateY(Math.PI / 2);
  for (let i = 0; i < 3; i++) { const o = new THREE.Group(); o.add(mesh(logG, m.bark)); o.add(mesh(capG, m.cut, LS / 2 - 0.002, 0, 0)); const c2 = mesh(capG, m.cut, -LS / 2 + 0.002, 0, 0); c2.rotation.y = Math.PI; o.add(c2); B.add(o); logs.push(o); }
  [arm, ...logs].forEach(noShadow);
  const UP = -1.1, Tp = 3.4, T0 = 1.3, T = T0 + 3 * Tp;
  out.anim = (t, dt, emit) => {
    blade.rotation.x -= dt * 22;
    const u = t % T; let p = 0, front = CUT, z = 0, roll = 0, th = UP, fall = -1;
    if (u < T0) { const k = seg01(u, 0.1, 1.1); z = -0.55 * (1 - k); roll = -z / LR; }        // новое бревно скатывается на верстак
    else {
      p = Math.floor((u - T0) / Tp); const v = (u - T0) - p * Tp;
      front = CUT + LS * seg01(v, 0, 0.8);                                                   // подача на длину чурбака
      th = v < 1.0 ? UP : v < 1.9 ? UP * (1 - seg01(v, 1.0, 1.9)) : UP * seg01(v, 1.9, 2.5); // пила опускается сквозь бревно и поднимается
      if (v > 2.0) fall = Math.min(1, (v - 2.0) / 0.6);
      if (v > 1.3 && v < 1.85 && Math.random() < 0.8) { const q = wpos(B, CUT, LY - 0.02, 0.08); emit("dust", q.x, q.y, q.z); }
      if (v > 2.6 && v - dt <= 2.6) { const q = wpos(B, CUT + LS / 2 + 0.45, 0.15, 0.1); emit("thud", q.x, q.y, q.z); }
    }
    arm.rotation.x = th;
    logs.forEach((o, i) => {
      if (i < p || (i === p && fall >= 1)) { o.visible = false; return; }
      o.visible = true; o.rotation.set(roll, 0, 0);
      if (i === p && fall >= 0) { const k = fall; o.position.set(CUT + LS / 2 + 0.42 * k, LY - 0.5 * k * k, 0.12 * k); o.rotation.set(-k * 2.5, 0, -0.35 * k); return; }   // отрезанный чурбак скатывается в штабель
      o.position.set(front - LS / 2 - (i - p) * LS, LY, z);
    });
  };
  return B;
}
// каменоломня: скальный выход с уступами, рабочий с киркой откалывает камень, кран-укосина переносит блоки в штабель
const Q = { mast: [1.05, 0.05], R: 0.78, top: 1.9, pick: [0.5, -0.5], stack: [1.35, 0.8] };
function quarryWork(site, out, lv) {
  const m = gmats();
  const rmat = m.rock;
  for (const [n, x, z, sc, ry] of [["Rock_Medium_2", -0.4, -1.0, 0.5, 0.4], ["Rock_Medium_1", 0.62, -1.12, 0.4, 2.1], ["Rock_Medium_3", -1.05, -0.55, 0.3, 1.2]]) { const r = cloneNature(n); r.traverse((o) => { if (o.isMesh) { o.material = rmat; o.castShadow = true; o.receiveShadow = true; } }); r.position.set(x, -0.05, z); r.scale.setScalar(sc); r.rotation.y = ry; site.add(r); }
  // уступы: обтёсанные ступени у скалы
  site.add(mesh(setUV(new THREE.BoxGeometry(1.45, 0.55, 0.62), 1), m.block, 0.08, 0.27, -0.5));
  site.add(mesh(setUV(new THREE.BoxGeometry(0.75, 0.32, 0.36), 1), m.block, -0.38, 0.16, -0.05));
  site.add(mesh(setUV(new THREE.BoxGeometry(0.62, 0.22, 0.5), 1), m.block, 0.75, 0.11, -0.05));
  // кран: мачта на крестовине, укосина с противовесом, канат и крюк
  const [mx, mz] = Q.mast;
  { const mast = mesh(new THREE.BoxGeometry(0.12, Q.top, 0.12), m.wood, mx, Q.top / 2, mz); mast.userData.noCrown = 1; site.add(mast); }   // корона не на мачту — по ней ходит укосина
  for (const r of [0, Math.PI / 2]) { const f = mesh(new THREE.BoxGeometry(0.62, 0.08, 0.1), m.wood, mx, 0.04, mz); f.rotation.y = r; site.add(f); }
  site.add(mesh(new THREE.BoxGeometry(0.05, 0.7, 0.05), m.wood, mx + 0.2, 0.32, mz).rotateZ(0.5)); site.add(mesh(new THREE.BoxGeometry(0.05, 0.7, 0.05), m.wood, mx - 0.2, 0.32, mz).rotateZ(-0.5));
  const jib = new THREE.Group(); jib.position.set(mx, Q.top - 0.06, mz); site.add(jib);
  jib.add(mesh(new THREE.BoxGeometry(0.08, 0.08, 1.15), m.wood, 0, 0, Q.R - 0.55));
  jib.add(mesh(new THREE.BoxGeometry(0.05, 0.05, 0.9), m.wood, 0, 0.2, Q.R * 0.35).rotateX(0.24));
  jib.add(mesh(new THREE.BoxGeometry(0.07, 0.3, 0.07), m.wood, 0, 0.13, 0));
  jib.add(mesh(setUV(new THREE.BoxGeometry(0.24, 0.2, 0.22), 1), m.block, 0, -0.06, -0.27));   // противовес
  const ropeG = new THREE.CylinderGeometry(0.012, 0.012, 1, 5).translate(0, -0.5, 0), rope = mesh(ropeG, m.rope, 0, -0.04, Q.R); jib.add(rope);
  const hook = new THREE.Group(); jib.add(hook); hook.add(mesh(new THREE.BoxGeometry(0.1, 0.06, 0.1), M.iron, 0, 0.03, 0));
  const BW = 0.26, BH = 0.2, BD = 0.22, blkG = setUV(new THREE.BoxGeometry(BW, BH, BD), 0.4), carried = mesh(blkG, m.block, 0, -BH / 2, 0); hook.add(carried);
  // свежий блок на верхнем уступе, который заберёт кран
  const [px, pz] = Q.pick, fresh = mesh(blkG, m.block, px, 0.55 + BH / 2, pz); site.add(fresh);
  // штабель на поддоне — он же показывает накопленный камень (game.js открывает блоки по запасу)
  const [sx, sz] = Q.stack, pal = new THREE.Group(); pal.position.set(sx, 0, sz); site.add(pal);
  pal.add(mesh(new THREE.BoxGeometry(0.62, 0.06, 0.52), m.wood, 0, 0.03, 0));
  const stack = new THREE.Group(); pal.add(stack);
  for (let l = 0; l < 2; l++) for (let i = 0; i < 4; i++) { const o = mesh(blkG, m.block, (i % 2 - 0.5) * (BW + 0.02), 0.06 + BH / 2 + l * BH, (Math.floor(i / 2) - 0.5) * (BD + 0.02)); o.rotation.y = (i * 0.07) % 0.1 - 0.04; stack.add(o); }
  stack.children.forEach((o) => (o.visible = false)); out.stack = stack;
  // рабочий с киркой (персонаж KayKit) — стоит лицом к нижнему уступу
  const wk = makeChar("barbarian"); wk.obj.scale.setScalar(0.48); wk.obj.position.set(-0.38, 0, 0.5); wk.obj.rotation.y = Math.PI;
  wk.meshes.forEach((o) => { if (/Hat|Cape/.test(o.name)) o.visible = false; else o.material = teamMaterial(o.material, 0x8a6a48, 0); });
  const hand = wk.bone("handslotr"); if (hand) hand.add(makePick());
  site.add(wk.obj); out.worker = wk.obj;
  const chop = wk.act("1H_Melee_Attack_Chop"), dur = chop ? chop.getClip().duration : 1, IMP = 0.42; if (chop) { chop.timeScale = 0.85; chop.play(); }
  [jib, fresh, stack].forEach(noShadow);
  const ya = (x, z) => Math.atan2(x - mx, z - mz), yP = ya(px, pz), yS = ya(sx, sz), T = 8;
  const L0 = 0.42, LP = Q.top - 0.1 - (0.55 + BH);
  out.anim = (t, dt, emit) => {
    if (chop) { const a0 = (chop.time / dur) % 1; wk.mixer.update(dt); const a1 = (chop.time / dur) % 1; if (a0 < IMP && a1 >= IMP || (a1 < a0 && IMP > a0)) { const q = wpos(site, -0.38, 0.22, -0.2); emit("chips", q.x, q.y, q.z); } }
    const u = t % T, n = stack.children.filter((o) => o.visible).length, LS = Q.top - 0.1 - (0.06 + Math.min(2, Math.ceil(n / 4)) * BH + BH);
    let yaw = yP, L = L0, has = false;
    if (u < 1.0) L = L0 + (LP - L0) * seg01(u, 0, 1.0);
    else if (u < 1.5) { L = LP; has = u > 1.25; }
    else if (u < 2.5) { L = LP + (L0 - LP) * seg01(u, 1.5, 2.5); has = true; }
    else if (u < 4.3) { yaw = yP + (yS - yP) * seg01(u, 2.5, 4.3); has = true; }
    else if (u < 5.3) { yaw = yS; L = L0 + (LS - L0) * seg01(u, 4.3, 5.3); has = true; }
    else if (u < 5.7) { yaw = yS; L = LS; has = u < 5.45; }
    else if (u < 6.6) { yaw = yS; L = LS + (L0 - LS) * seg01(u, 5.7, 6.6); }
    else yaw = yS + (yP - yS) * seg01(u, 6.6, T);
    const sw = Math.sin(t * 2.3) * 0.02 * (u > 2.5 && u < 4.6 ? 1 : 0.3);   // груз чуть раскачивается на ходу
    jib.rotation.y = yaw; rope.scale.y = L; hook.position.set(sw, -0.04 - L, Q.R); carried.visible = has;
    fresh.visible = u < 1.25 || u > 7.0; fresh.scale.setScalar(u > 7.0 ? ease((u - 7.0) / 0.5) : 1);
    if (u > 7.0 && u - dt <= 7.0) { const q = wpos(site, px, 0.62, pz); emit("chips", q.x, q.y, q.z); }
    if (u > 5.45 && u - dt <= 5.45) { const q = wpos(site, sx, 0.3, sz); emit("dust", q.x, q.y, q.z); }
  };
}
// рудник: рельсы из штольни к куче золота, вагонетка выезжает, опрокидывается и уезжает обратно
function mineWork(site, out) {
  const m = gmats(), Z0 = 0.42, Z1 = 1.95, ZI = 0.05, ZO = 1.5;
  for (const x of [-0.15, 0.15]) site.add(mesh(new THREE.BoxGeometry(0.035, 0.04, Z1 - Z0 + 0.25), m.rail, x, 0.07, (Z0 + Z1) / 2 - 0.12));
  for (let z = Z0; z <= Z1; z += 0.22) site.add(mesh(new THREE.BoxGeometry(0.46, 0.04, 0.09), m.wood, 0, 0.03, z));
  site.add(mesh(new THREE.BoxGeometry(0.42, 0.18, 0.1), m.wood, 0, 0.12, Z1 + 0.08));   // упор в конце пути
  const cart = new THREE.Group(); site.add(cart);
  const wheels = []; for (const x of [-0.17, 0.17]) for (const z of [-0.12, 0.12]) { const w = mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.04, 10), M.iron, x, 0.08, z); w.rotation.z = Math.PI / 2; cart.add(w); wheels.push(w); }
  cart.add(mesh(new THREE.BoxGeometry(0.3, 0.05, 0.36), M.iron, 0, 0.14, 0));
  const tip = new THREE.Group(); tip.position.set(0, 0.17, 0.16); cart.add(tip);   // ковш опрокидывается вперёд на передней оси
  const bucket = mesh(new THREE.CylinderGeometry(0.3, 0.22, 0.24, 4, 1, true), m.bucket, 0, 0.12, -0.16); bucket.rotation.y = Math.PI / 4; bucket.scale.set(1, 1, 0.85); tip.add(bucket);
  tip.add(mesh(new THREE.BoxGeometry(0.3, 0.02, 0.28), M.iron, 0, 0.01, -0.16));
  for (const z of [-0.3, -0.02]) tip.add(mesh(new THREE.BoxGeometry(0.43, 0.05, 0.04), m.wood, 0, 0.2, z));
  const gold = new THREE.Group(); tip.add(gold); for (let i = 0; i < 6; i++) gold.add(mesh(new THREE.IcosahedronGeometry(0.06 + (i % 3) * 0.012, 0), M.gold, ((i % 3) - 1) * 0.08, 0.2 + (i % 2) * 0.04, -0.16 + (Math.floor(i / 3) - 0.5) * 0.12));
  const lamp = cloneProp("Lantern_Wall"); lamp.scale.setScalar(0.55); lamp.position.set(0.42, 0.55, Z0 + 0.1); lamp.rotation.y = -Math.PI / 2; site.add(lamp);
  noShadow(cart);
  const T = 9;
  out.anim = (t, dt, emit) => {
    const u = t % T; let z = ZI, k = 0, full = true;
    if (u < 1.0) z = ZI;
    else if (u < 3.2) z = ZI + (ZO - ZI) * seg01(u, 1.0, 3.2);
    else if (u < 4.6) { z = ZO; k = seg01(u, 3.5, 4.1); full = u < 3.9; }
    else if (u < 5.2) { z = ZO; k = 1 - seg01(u, 4.6, 5.2); full = false; }
    else if (u < 7.4) { z = ZO + (ZI - ZO) * seg01(u, 5.2, 7.4); full = false; }
    else full = u > 8.2;
    if (u > 3.85 && u - dt <= 3.85) for (let i = 0; i < 3; i++) { const q = wpos(site, 0, 0.3, ZO + 0.45); emit("gold", q.x, q.y, q.z); }
    cart.position.z = z; cart.visible = z > Z0 - 0.3; tip.rotation.x = k * 0.85; gold.visible = full;
    wheels.forEach((w) => (w.rotation.x = z / 0.07));
  };
}
export function buildGatherer(k, lv, hue, broken) {
  mats();
  const g = new THREE.Group(), out = { g, fx: [], pile: null, h: 2.2 };
  if (broken) { const o = cloneWorld("building_destroyed"); o.scale.setScalar(1.6); g.add(o); out.fx.push({ k: "smoke", p: new THREE.Vector3(0, 0.8, 0) }); return bake(out); }
  const ks = 0.85 + 0.035 * lv, site = new THREE.Group(); site.scale.setScalar(ks); g.add(site);
  if (GMODEL[k]) { const [name, s0] = GMODEL[k], o = cloneWorld(name); o.traverse((c) => { if (c.isMesh) { c.material = hueMaterial(c.material, hue); if (k === "mine") c.material = toneRock(c.material); c.castShadow = true; c.receiveShadow = true; } }); o.scale.setScalar(s0); site.add(o); }
  if (k === "saw") sawWork(site, out); else if (k === "quarry") quarryWork(site, out, lv); else mineWork(site, out);
  const E = GEXTRA[k], P = (p) => new THREE.Vector3(p[0] * ks, p[1], p[2] * ks);
  const side = (p, obj, s) => { obj.position.set(p[0], 0, p[1]); obj.scale.setScalar(s); obj.rotation.y = p[2] || 0; obj.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } }); site.add(obj); return obj; };
  // уровни: тачка, мешок и ящик, телега доставки, флажок, бочки, факелы, золотая отделка, корона
  if (lv >= 2) side(E.barrow, cloneWorld("wheelbarrow"), 1.1);
  if (lv >= 3) { side(E.sack, cloneWorld("sack"), 1.2); side(E.crate, cloneWorld("crate_A_big"), 0.9); }
  if (lv >= 4) out.cartBig = side(E.cart, cloneProp("Stall_Cart_Empty"), 0.55);
  if (lv >= 5) { const [x, z] = E.flag, pole = mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.8, 5), M.wood, x, 0.9, z); site.add(pole); const fm = hueMaterial(new THREE.MeshStandardMaterial({ color: 0x3b82f6, roughness: 0.6, side: THREE.DoubleSide }), hue); site.add(mesh(new THREE.PlaneGeometry(0.5, 0.32), fm, x + 0.25, 1.6, z)); }
  if (lv >= 6) { side(E.barrels[0], cloneWorld("barrel"), 1.2); side(E.barrels[1], cloneWorld("barrel"), 1.1).rotation.y = 1; }
  if (lv >= 7) for (const tp of E.torches) { side(tp, cloneProp("Torch_Metal"), 0.95); out.fx.push({ k: "torch", p: new THREE.Vector3(tp[0] * ks, 1.15 * ks, tp[1] * ks) }); }
  if (lv >= 8) g.add(goldRing(E.ring * ks, 0.08, 0.05));
  if (lv >= 9) g.add(auraRing((E.ring + 0.25) * ks, 0xffd34d));
  if (lv >= 10) { const skip = new Set([out.worker, out.stack].filter(Boolean)); site.traverse((o) => { if (o.userData.nobake || o.userData.noCrown) skip.add(o); }); const pf = profile(g, skip), c = crown(pf.top - 0.08, 0.7); c.position.x = pf.at.x; c.position.z = pf.at.z; g.add(c); out.h = pf.top + 0.5; }   // корона — на самой верхушке постройки
  if (PILE[k]) { const pile = new THREE.Group(); pile.add(PILE[k]()); pile.position.set(PILE_AT[k][0], 0, PILE_AT[k][1]); pile.visible = false; site.add(pile); out.pile = pile; }
  return bake(out);
}

// ---------- наводка баллисты: площадка поворачивается к цели, люлька наклоняется, болт вылетает с кончика арбалета (по очереди) ----------
const _aq = new THREE.Quaternion();
export function aimTower(b, x, y, z) {
  const a = b && b.aim; if (!a) return null;
  a.parent.updateWorldMatrix(true, false); a.parent.getWorldQuaternion(_aq);
  const c = a.getWorldPosition(new THREE.Vector3()), py = 2 * Math.atan2(_aq.y, _aq.w), d = Math.hypot(x - c.x, z - c.z);   // башня повёрнута только вокруг y
  a.rotation.y = Math.atan2(x - c.x, z - c.z) - py;
  if (b.pitch) b.pitch.rotation.x = Math.max(-0.3, Math.min(0.55, Math.atan2(c.y + 0.2 - y, Math.max(1, d))));
  a.updateWorldMatrix(false, true);
  if (!b.tips || !b.tips.length) return null;
  b.alt = ((b.alt || 0) + 1) % b.tips.length;
  const tip = b.tips[b.alt], p = new THREE.Vector3(), f = new THREE.Vector3();
  for (let it = 0; it < 2; it++) {   // доводка: стреляющий арбалет (он сбоку от оси) смотрит точно на цель
    tip.getWorldPosition(p); f.set(0, 0, 1).transformDirection(tip.parent.matrixWorld);
    let dy = Math.atan2(x - p.x, z - p.z) - Math.atan2(f.x, f.z); while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI; a.rotation.y += dy;
    if (b.pitch) b.pitch.rotation.x = Math.max(-0.3, Math.min(0.55, b.pitch.rotation.x + Math.asin(Math.max(-1, Math.min(1, f.y))) - Math.atan2(y - p.y, Math.max(0.5, Math.hypot(x - p.x, z - p.z)))));
    a.updateWorldMatrix(false, true);
  }
  return tip.getWorldPosition(new THREE.Vector3());
}

// ---------- склейка статичных частей: одна постройка = несколько draw call вместо десятков ----------
// всё, на что есть ссылка в out (пила, вагонетка, кристалл, флаг, корона, куча…), не трогаем — оно анимируется
const _inv = new THREE.Matrix4(), _m = new THREE.Matrix4();
export function bake(out) {
  const root = out.g, keep = new Set();
  for (const k in out) { if (k === "g") continue; const v = out[k]; if (v && v.isObject3D) keep.add(v); else if (Array.isArray(v)) v.forEach((x) => x && x.isObject3D && keep.add(x)); }
  root.updateMatrixWorld(true); _inv.copy(root.matrixWorld).invert();
  const groups = new Map(), kill = [];
  const walk = (o) => {
    for (const c of o.children) {
      if (keep.has(c) || c.userData.orbit || c.userData.nobake) continue;
      if (c.isMesh && !c.isSkinnedMesh && !c.isInstancedMesh && !Array.isArray(c.material) && c.visible && !c.geometry.morphAttributes.position) {
        const key = c.material.uuid + (c.castShadow ? "s" : "") + (c.receiveShadow ? "r" : "");
        let gr = groups.get(key); if (!gr) groups.set(key, (gr = { mat: c.material, cs: c.castShadow, rs: c.receiveShadow, list: [] }));
        gr.list.push(c);
      }
      walk(c);
    }
  };
  walk(root);
  for (const gr of groups.values()) {
    if (gr.list.length < 2) continue;
    const geos = [];
    const vc = !!gr.mat.vertexColors;   // у реквизита KayKit цвет в вершинах: без атрибута color такие меши выходили чёрными
    for (const c of gr.list) {
      let g = c.geometry.index ? c.geometry.toNonIndexed() : c.geometry.clone();
      for (const n of Object.keys(g.attributes)) if (n !== "position" && n !== "normal" && n !== "uv" && !(vc && n === "color")) g.deleteAttribute(n);
      if (!g.attributes.normal) g.computeVertexNormals();
      if (!g.attributes.uv) g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      if (vc && !g.attributes.color) g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 4).fill(1), 4));
      if (vc && g.attributes.color.itemSize === 3) { const a = g.attributes.color, f = new Float32Array(a.count * 4); for (let i = 0; i < a.count; i++) { f[i * 4] = a.getX(i); f[i * 4 + 1] = a.getY(i); f[i * 4 + 2] = a.getZ(i); f[i * 4 + 3] = 1; } g.setAttribute("color", new THREE.BufferAttribute(f, 4)); }
      for (const n of vc ? ["position", "normal", "uv", "color"] : ["position", "normal", "uv"]) { const a = g.attributes[n]; if (a.isInterleavedBufferAttribute || a.normalized || !(a.array instanceof Float32Array)) { const f = new Float32Array(a.count * a.itemSize); for (let i = 0; i < a.count; i++) for (let j = 0; j < a.itemSize; j++) f[i * a.itemSize + j] = a.getComponent(i, j); g.setAttribute(n, new THREE.BufferAttribute(f, a.itemSize)); } }
      g.applyMatrix4(_m.multiplyMatrices(_inv, c.matrixWorld));
      geos.push(g);
    }
    const merged = mergeGeometries(geos, false); geos.forEach((g) => g.dispose());
    if (!merged) continue;
    const m = new THREE.Mesh(merged, gr.mat); m.castShadow = gr.cs; m.receiveShadow = gr.rs; m.userData.baked = 1;
    root.add(m); kill.push(...gr.list);
  }
  for (const c of kill) { c.parent.remove(c); }
  // опустевшие группы убираем
  const prune = (o) => { for (const c of [...o.children]) { prune(c); if (!c.isMesh && !c.children.length && !keep.has(c) && c.type === "Group") o.remove(c); } };
  prune(root);
  return out;
}
