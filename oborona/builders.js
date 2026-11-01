// Постройки: башни 8 видов (каждый уровень выглядит иначе) и дома трёх стилей.
// Средневековые — модели KayKit, восточные (пагоды, минареты, дворцы) и северные — собраны из геометрии с PBR-текстурами.
import * as THREE from "three";
import { cloneWorld, cloneProp, cloneWeapon, hueMaterial, pbr } from "./assets.js";

const M = {};
function mats() {
  if (M.ready) return M;
  M.roof = pbr("roof", 1, { roughness: 0.7 });
  M.roofG = pbr("roofgrey", 1, { roughness: 0.75 });
  M.wood = pbr("cedar", 1, { roughness: 0.6 });
  M.plaster = pbr("plaster", 1, { roughness: 0.9 });
  M.sand = pbr("sandblock", 1, { roughness: 0.85 });
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
  const banners = (n, y, r) => { for (let i = 0; i < n; i++) { const b = cloneProp(i % 2 ? "Banner_2" : "Banner_1"); b.scale.setScalar(0.55); const a = i / n * Math.PI * 2; b.position.set(Math.cos(a) * r, y, Math.sin(a) * r); b.rotation.y = -a + Math.PI / 2; g.add(b); } };
  const goldTop = (y, s) => { const o = mesh(new THREE.ConeGeometry(0.12 * s, 0.7 * s, 8), M.gold, 0, y + 0.35 * s, 0); g.add(o); const b = mesh(new THREE.SphereGeometry(0.16 * s, 12, 8), M.gold, 0, y, 0); g.add(b); };
  if (type === "arrow") {
    const big = lv >= 3; kk(big ? "building_tower_B_blue" : "building_tower_A_blue", big ? 1.75 + 0.08 * (lv - 3) : 1.75 + 0.1 * (lv - 1));
    out.top.set(0, big ? 3.9 : 3.4, 0);
    if (lv >= 2) banners(lv >= 4 ? 4 : 2, big ? 2.4 : 2.0, 0.85);
    if (lv >= 4) goldTop(4.5, 1);
  } else if (type === "cannon") {
    kk("building_tower_catapult_blue", 1.7 + 0.12 * (lv - 1));
    out.top.set(0, 2.9 + 0.2 * (lv - 1), 0);
    if (lv >= 3) { const r = mesh(new THREE.CylinderGeometry(1.25, 1.4, 0.5, 18), M.stone, 0, 0.25, 0); g.add(r); }
    if (lv >= 4) banners(3, 1.9, 1.0);
  } else if (type === "ballista") {
    kk("building_tower_base_blue", 1.6 + 0.08 * (lv - 1));
    const aim = new THREE.Group(); aim.position.y = 2.45 + 0.12 * (lv - 1); g.add(aim);
    const n = lv >= 3 ? 2 : 1;
    for (let i = 0; i < n; i++) { const c = cloneWeapon("crossbow_2handed"); c.scale.setScalar(1.25 + 0.15 * (lv - 1)); c.rotation.x = -Math.PI / 2; c.position.set(n > 1 ? (i ? 0.45 : -0.45) : 0, 0.1, 0); aim.add(c); }
    const plat = mesh(new THREE.CylinderGeometry(0.7, 0.8, 0.18, 12), M.wood, 0, -0.05, 0); aim.add(plat);
    if (lv >= 4) { const r = mesh(new THREE.TorusGeometry(0.75, 0.06, 6, 24), M.gold, 0, 0.05, 0); r.rotation.x = Math.PI / 2; aim.add(r); }
    out.aim = aim; out.top.set(0, aim.position.y + 0.2, 0);
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
  if (lv >= 4) { for (const sx of [-1, 1]) { const b = cloneProp("Banner_1"); b.scale.setScalar(0.8); b.position.set(sx * 0.7, 1.0, D / 2 + 0.1); g.add(b); } }
  const pole = mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.6, 5), M.wood, W / 2 + 0.3, 1.1, D / 2 + 0.3); g.add(pole);
  const fl = mesh(new THREE.PlaneGeometry(0.6, 0.38), flagM, W / 2 + 0.6, 1.65, D / 2 + 0.3); fl.material.side = THREE.DoubleSide; g.add(fl); out.flag = fl;
  const l = cloneProp("Lantern_Wall"); l.scale.setScalar(0.9); l.position.set(-0.55, 1.2, D / 2 + 0.05); g.add(l); out.fx.push({ k: "lamp", p: new THREE.Vector3(-0.55, 1.05, D / 2 + 0.3) });
  out.h = y + 0.4;
  return out;
}
export { pagodaRoof, onionDome, mats as builderMats, M as BM };
