// 3D-отрисовка «Снайпера» на three.js. Логика игры (2D-координаты, попадания) не меняется:
// мир лежит в плоскости, X = x, Y = G − y; укрытия — толщиной по Z, человечек стоит за ними (Z < 0),
// снайпер сидит на острове со стороны моря (Z > 0). Фронтальные камеры строятся так, что плоскость
// человечка ложится на экран ровно как старая 2D-картинка — значит прицел и попадания совпадают.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const G = 232, WW = 360, HM = 112, AR = 4;          // HM — высота атласа укрытий в мировых единицах
const ZH = -15;                                    // плоскость человечка
const DS = 1200;                                   // расстояние до снайпера
const THEMES = [
  { sky: ["#3f8fe0", "#cfe9ff"], fog: "#d6ecff", sea: "#1d78c2", seaDeep: "#0f4f8f", sand: "#e3bd7a", sandDark: "#c39a5a", sun: "#fff3dc", sunI: 2.6, hemi: 1.05, sunPos: [-260, 420, 520], brickH: 22 },
  { sky: ["#4a2f7e", "#ffb184"], fog: "#f5b08f", sea: "#3c4f98", seaDeep: "#262f66", sand: "#d8a06a", sandDark: "#a8703e", sun: "#ffc8a0", sunI: 3.2, hemi: 1.15, sunPos: [-520, 190, 420], brickH: 8 }
];

function rng(seed) {
  let a = (seed * 2654435761) >>> 0 || 1;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const hsl = (h, s, l) => `hsl(${h},${s}%,${l}%)`;

function canvasTex(w, h, draw, repeat) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  return t;
}

// ---------- плитки для боков и земли ----------
function brickTile(hue) {
  return canvasTex(128, 128, (g) => {
    g.fillStyle = "#7d5a40"; g.fillRect(0, 0, 128, 128);
    const r = rng(hue + 3);
    for (let row = 0; row < 8; row++) for (let k = -1; k < 5; k++) {
      const x = k * 32 + (row % 2 ? 16 : 0);
      g.fillStyle = hsl(hue + r() * 8, 38 + r() * 12, 40 + r() * 12); g.fillRect(x + 1.5, row * 16 + 1.5, 29, 13);
    }
  }, true);
}
function woodTile() {
  return canvasTex(128, 128, (g) => {
    for (let i = 0; i < 4; i++) { g.fillStyle = hsl(30, 48, 44 + (i % 2) * 5); g.fillRect(0, i * 32, 128, 32); g.fillStyle = "rgba(60,30,10,.5)"; g.fillRect(0, i * 32, 128, 2); }
    g.strokeStyle = "rgba(70,40,15,.25)"; for (let i = 0; i < 40; i++) { g.beginPath(); const y = Math.random() * 128; g.moveTo(0, y); g.bezierCurveTo(40, y + 3, 80, y - 3, 128, y); g.stroke(); }
  }, true);
}
function noiseTile(base, dark, n) {
  return canvasTex(256, 256, (g) => {
    g.fillStyle = base; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < (n || 2600); i++) { g.fillStyle = Math.random() < 0.5 ? dark : "rgba(255,255,255,.18)"; g.globalAlpha = 0.25 + Math.random() * 0.35; g.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 2, 1 + Math.random() * 1.5); }
    g.globalAlpha = 1;
  }, true);
}

// ---------- атлас лицевых сторон укрытий (в старых 2D-координатах, дырки — прозрачные) ----------
function drawAtlas(g, map, TH) {
  g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, g.canvas.width, g.canvas.height);
  g.setTransform(AR, 0, 0, AR, 0, (HM - G) * AR);
  for (const c of map.covers) {
    const y = G - c.h, r = rng(c.seed);
    if (c.kind === "wall") {
      g.fillStyle = "#7a5640"; g.fillRect(c.x, y, c.w, c.h);
      const bh = 8.5, bw = 17;
      for (let row = 0, yy = y + 1; yy < G; yy += bh, row++) for (let xx = c.x - (row % 2 ? bw / 2 : 0); xx < c.x + c.w; xx += bw) {
        const x0 = Math.max(c.x + 0.7, xx + 0.7), x1 = Math.min(c.x + c.w - 0.7, xx + bw - 0.7); if (x1 <= x0) continue;
        const l = 40 + r() * 13, h = TH.brickH + r() * 8;
        g.fillStyle = hsl(h, 36 + r() * 12, l); g.fillRect(x0, yy + 0.7, x1 - x0, Math.min(bh - 1.4, G - yy - 0.7));
        g.fillStyle = "rgba(255,255,255,.10)"; g.fillRect(x0, yy + 0.7, x1 - x0, 1.1);
        g.fillStyle = "rgba(0,0,0,.12)"; g.fillRect(x0, yy + bh - 2.2, x1 - x0, 1.1);
        if (r() < 0.12) { g.fillStyle = "rgba(0,0,0,.18)"; g.fillRect(x0 + r() * 8, yy + 2, 2 + r() * 3, 1.2); }
      }
      // грязь у земли и потёки
      const gr = g.createLinearGradient(0, G - 22, 0, G); gr.addColorStop(0, "rgba(90,60,30,0)"); gr.addColorStop(1, "rgba(90,60,30,.45)");
      g.fillStyle = gr; g.fillRect(c.x, G - 22, c.w, 22);
      const vines = 1 + Math.floor(r() * 3);
      for (let v = 0; v < vines; v++) {
        let vx = c.x + 8 + r() * (c.w - 16), vy = y + 1; const len = 20 + r() * (c.h * 0.6), pts = [];
        g.strokeStyle = "#35602a"; g.lineWidth = 1.3; g.beginPath(); g.moveTo(vx, vy);
        for (let k = 0; k < len; k += 4) { vx += (r() - 0.5) * 5; vy += 4; g.lineTo(vx, vy); pts.push([vx, vy]); } g.stroke();
        for (const [px, py] of pts) if (r() < 0.8) { g.fillStyle = r() < 0.5 ? "#5b9a3a" : "#447f2b"; g.beginPath(); g.ellipse(px + (r() - 0.5) * 6, py, 3, 1.9, r() * 3, 0, 7); g.fill(); }
      }
    } else if (c.kind === "sand") {
      g.fillStyle = "#8c7444"; g.fillRect(c.x, y, c.w, c.h);
      for (let row = 0; row < 4; row++) for (let k = -1; k < c.w / 18 + 1; k++) {
        const bx = c.x + k * 18 + (row % 2 ? 9 : 0), by = G - 11 - row * 11;
        const x0 = Math.max(c.x, bx), x1 = Math.min(c.x + c.w, bx + 18.5); if (x1 <= x0) continue;
        const gr = g.createLinearGradient(0, by, 0, by + 11); const L = 62 + r() * 8;
        gr.addColorStop(0, hsl(42, 32, L + 8)); gr.addColorStop(1, hsl(40, 30, L - 14));
        g.fillStyle = gr; g.beginPath(); g.roundRect(x0, by, x1 - x0, 11, 4.5); g.fill();
        g.strokeStyle = "rgba(90,70,35,.6)"; g.lineWidth = 0.6; g.beginPath(); g.moveTo(x0 + 3, by + 5.5); g.lineTo(x1 - 3, by + 5.5); g.stroke();
      }
    } else if (c.kind === "crate") {
      for (let k = 0; k < 5; k++) { g.fillStyle = hsl(30, 50, 44 + (k % 2) * 6 + r() * 4); g.fillRect(c.x, y + k * c.h / 5, c.w, c.h / 5); g.fillStyle = "rgba(60,30,10,.45)"; g.fillRect(c.x, y + k * c.h / 5, c.w, 0.8); }
      g.strokeStyle = "#6b4520"; g.lineWidth = 5; g.strokeRect(c.x + 2.5, y + 2.5, c.w - 5, c.h - 5);
      g.lineWidth = 4.5; g.beginPath(); g.moveTo(c.x + 5, y + 5); g.lineTo(c.x + c.w - 5, y + c.h - 5); g.stroke();
      g.fillStyle = "#3a3a3a"; for (const [px, py] of [[4, 4], [c.w - 4, 4], [4, c.h - 4], [c.w - 4, c.h - 4]]) { g.beginPath(); g.arc(c.x + px, y + py, 1.1, 0, 7); g.fill(); }
      g.fillStyle = "rgba(20,20,20,.55)"; g.font = "bold 7px sans-serif"; g.textAlign = "center"; g.fillText("AMMO", c.x + c.w / 2, y + c.h * 0.3);
    } else {
      const gr = g.createLinearGradient(c.x, 0, c.x + c.w, 0);
      gr.addColorStop(0, "#22462c"); gr.addColorStop(0.42, "#5aa067"); gr.addColorStop(1, "#1c3a24");
      g.fillStyle = gr; g.fillRect(c.x, y, c.w, c.h);
      g.fillStyle = "rgba(0,0,0,.3)"; g.fillRect(c.x, y + 13, c.w, 3); g.fillRect(c.x, y + c.h - 16, c.w, 3);
      g.fillStyle = "rgba(255,255,255,.18)"; g.fillRect(c.x, y + 12, c.w, 1);
      g.save(); g.translate(c.x + c.w / 2, y + c.h / 2); g.rotate(Math.PI / 4);
      g.fillStyle = "#fff"; g.fillRect(-7, -7, 14, 14); g.fillStyle = "#e5484d"; g.fillRect(-5, -5, 10, 10); g.restore();
      for (let i = 0; i < 6; i++) { g.fillStyle = "rgba(120,60,20,.35)"; g.fillRect(c.x + r() * c.w, y + r() * c.h, 1 + r() * 3, 1 + r() * 4); }
    }
  }
  // дырки: окна и пробоины — вырезаем, по краю тёмный ободок
  g.globalCompositeOperation = "destination-out"; g.fillStyle = "#000";
  for (const c of map.covers) for (const o of c.open) { g.beginPath(); if (o.t === "r") g.rect(o.x, o.y, o.w, o.h); else g.arc(o.x, o.y, o.r, 0, 7); g.fill(); }
  g.globalCompositeOperation = "source-atop";
  for (const c of map.covers) for (const o of c.open) {
    if (o.t === "r") { g.strokeStyle = "rgba(25,12,4,.85)"; g.lineWidth = 2.4; g.strokeRect(o.x - 1.2, o.y - 1.2, o.w + 2.4, o.h + 2.4);
      g.fillStyle = "#6b4a2a"; g.fillRect(o.x - 3, o.y + o.h + 1, o.w + 6, 2.6); }
    else { g.strokeStyle = "rgba(25,12,4,.85)"; g.lineWidth = 2; g.beginPath(); g.arc(o.x, o.y, o.r + 0.9, 0, 7); g.stroke();
      g.strokeStyle = "rgba(255,235,205,.45)"; g.lineWidth = 1; g.beginPath(); g.arc(o.x, o.y, o.r + 2.4, 0.5, 2.3); g.stroke(); }
  }
  g.globalCompositeOperation = "source-over";
}

// ---------- человечек ----------
function makeSoldier(shirtColor) {
  const grp = new THREE.Group();
  const M = (c, r) => new THREE.MeshStandardMaterial({ color: c, roughness: r == null ? 0.8 : r });
  const shirt = M(shirtColor, 0.75), pants = M("#4a5536"), skin = M("#f0c49c", 0.6), helm = M("#4f5e36", 0.55), boot = M("#202020", 0.6), dark = M("#1b1b1b");
  const box = (w, h, d, mat) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.castShadow = true; return m; };
  const limb = (len, w, mat, footMat) => {               // точка вращения сверху
    const p = new THREE.Group(); const m = box(w, len, w, mat); m.position.y = -len / 2; p.add(m);
    if (footMat) { const f = box(w + 4, 4, w + 1, footMat); f.position.set(2, -len + 1, 0); p.add(f); }
    return p;
  };
  const legs = [0, 1].map((i) => {
    const thigh = limb(15, 7, pants); const shin = limb(14, 6.6, pants, boot); shin.position.y = -15; thigh.add(shin);
    thigh.position.set(0, 29, i ? -3.6 : 3.6); grp.add(thigh); return { thigh, shin };
  });
  const torso = new THREE.Group(); grp.add(torso);
  const chest = box(18, 28, 20, shirt); chest.position.y = 14; torso.add(chest);
  const vest = box(19, 12, 21, M("#5b6640")); vest.position.y = 15; torso.add(vest);
  const pack = box(4, 18, 15, M("#56603a")); pack.position.set(-10.5, 15, 0); torso.add(pack);
  const belt = box(18.6, 3, 20.6, dark); belt.position.y = 2.5; torso.add(belt);
  const head = new THREE.Group(); torso.add(head);
  const face = new THREE.Mesh(new THREE.SphereGeometry(8.5, 18, 14), skin); face.castShadow = true; head.add(face);
  const hel = new THREE.Mesh(new THREE.SphereGeometry(9.6, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), helm); hel.position.y = 1.4; hel.castShadow = true; head.add(hel);
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(10.6, 10.6, 1.6, 20), helm); brim.position.y = 1.4; head.add(brim);
  const eye = box(1.5, 2, 2, dark); eye.position.set(8, 0.5, 3); head.add(eye); const eye2 = eye.clone(); eye2.position.z = -3; head.add(eye2);
  const arms = [0, 1].map((i) => { const a = limb(19, 5.6, shirt); const hand = box(5.4, 4.5, 5.4, skin); hand.position.y = -20; a.add(hand); a.position.set(0, 25, i ? -12.5 : 12.5); torso.add(a); return a; });
  grp.userData = { legs, torso, head, arms, chest, vest, pack, cr: 0 };
  return grp;
}
// поза: st — присел, walk — фаза шага. Габариты повторяют хитбоксы из game.js
function poseSoldier(s, p, dt) {
  const u = s.userData; u.cr += ((p.st ? 1 : 0) - u.cr) * Math.min(1, dt * 14);
  const c = u.cr, sw = Math.sin(p.walk || 0) * (1 - c);
  const hip = 29 - 14 * c;
  u.legs.forEach((l, i) => {
    l.thigh.position.y = hip;
    l.thigh.rotation.z = (i ? -sw : sw) * 0.36 + c * 1.45;     // присед: бедро вперёд
    l.shin.rotation.z = -c * (i ? 1.55 : 1.45) - Math.max(0, (i ? sw : -sw)) * 0.5;
  });
  u.torso.position.y = hip - 2;
  u.torso.scale.y = 1 - c * 0.18;
  u.head.position.y = 34 - c * 5; u.head.scale.y = 1 / u.torso.scale.y;
  u.arms.forEach((a, i) => { a.rotation.z = (i ? sw : -sw) * 0.7 - c * 0.5; });
  s.rotation.y = (p.dir || 1) < 0 ? Math.PI : 0;
}


// ---------- персонаж: модель Quaternius (CC0), анимации Idle/Walk + присед из позы SitDown ----------
const HERO_COL = { Skin: "#e9b48f", Helmet: "#56633b", Black: "#1f1f1f", Grey: "#8d8766", Face: "#ffffff" };
const HERO_SCALE = 23;
export function loadHero(onReady) {
  new GLTFLoader().load("models/soldier.glb?v=1", (g) => {
    const root = new THREE.Group(), model = g.scene; root.add(model); model.scale.setScalar(HERO_SCALE);
    let main = null, vest = null;
    model.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true; o.frustumCulled = false;
      // лицо — кожа, перчатки и ботинки — тёмные (в модели это один материал Skin): красим по вершинам
      const pos = o.geometry.attributes.position, sk = o.geometry.attributes.skinIndex, col = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) { const head = pos.getY(i) > 1.95 && Math.abs(pos.getX(i)) < 0.6; const v = head ? 1 : 0.13; col[i * 3] = v; col[i * 3 + 1] = head ? 1 : 0.125; col[i * 3 + 2] = head ? 1 : 0.11; }
      o.geometry.setAttribute("color", new THREE.BufferAttribute(col, 3));
      const ms = [].concat(o.material).map((m) => { m = m.clone(); if (HERO_COL[m.name]) m.color.set(HERO_COL[m.name]); if (m.name === "Skin") m.vertexColors = true; if (m.name === "Main") main = m; if (m.name === "Black") vest = m; m.roughness = 0.78; m.metalness = 0; return m; });
      o.material = ms.length === 1 ? ms[0] : ms;
    });
    const B = {}; model.traverse((b) => { if (b.isBone) B[b.name] = b; });
    const clip = (n) => g.animations.find((a) => a.name === n);
    const mixer = new THREE.AnimationMixer(model);
    const idle = mixer.clipAction(clip("Idle")), walk = mixer.clipAction(clip("Walk")), sit = mixer.clipAction(clip("SitDown"));
    // снимок позы: Idle и конец SitDown → «глубокий присед» (продолжаем движение ног дальше SitDown)
    const snap = (act, t) => { mixer.stopAllAction(); act.reset().play(); act.setLoop(THREE.LoopOnce); act.clampWhenFinished = true; mixer.setTime(t); model.updateMatrixWorld(true);
      const q = {}; for (const n in B) q[n] = { q: B[n].quaternion.clone(), p: B[n].position.clone() }; return q; };
    const I = snap(idle, 0.3), S = snap(sit, sit.getClip().duration - 0.001);
    const crouchQ = {};
    for (const [n, k] of [["UpperLegL", 1.85], ["UpperLegR", 1.75], ["LowerLegL", 2.7], ["LowerLegR", 2.6]]) {
      const d = I[n].q.clone().invert().multiply(S[n].q), q = I[n].q.clone(); let r = k;
      while (r >= 1) { q.multiply(d); r--; } q.multiply(new THREE.Quaternion().slerp(d, r)); crouchQ[n] = q;
    }
    // где окажутся стопы в приседе (стопы — отдельные IK-кости, их надо переставить)
    mixer.stopAllAction(); idle.reset().play(); idle.setLoop(THREE.LoopRepeat); mixer.setTime(0.3);
    model.updateMatrixWorld(true);
    const V = () => new THREE.Vector3(), Qt = () => new THREE.Quaternion();
    const footOff = {}; for (const sd of ["L", "R"]) { const lp = B["LowerLeg" + sd].getWorldPosition(V()), fp = B["Foot" + sd].getWorldPosition(V()); footOff[sd] = fp.sub(lp).applyQuaternion(B["LowerLeg" + sd].getWorldQuaternion(Qt()).invert()); }
    const ground = Math.min(B.FootL.getWorldPosition(V()).y, B.FootR.getWorldPosition(V()).y);
    for (const n in crouchQ) B[n].quaternion.copy(crouchQ[n]); B.Abdomen.rotateX(0.3); model.updateMatrixWorld(true);
    const crouchFoot = {}; let lo = 1e9;
    for (const sd of ["L", "R"]) { const tip = B["LowerLeg" + sd].getWorldPosition(V()).add(footOff[sd].clone().applyQuaternion(B["LowerLeg" + sd].getWorldQuaternion(Qt()))); lo = Math.min(lo, tip.y); crouchFoot[sd] = tip; }
    const drop = lo - ground - 2.5;                                    // на сколько опустить модель (в мировых единицах)
    for (const sd of ["L", "R"]) { const f = B["Foot" + sd]; const w = crouchFoot[sd].clone(); f.parent.worldToLocal(w); crouchFoot[sd] = w; }
    const abQ = B.Abdomen.quaternion.clone(); model.position.y = 0;
    idle.reset().play(); walk.play(); walk.setEffectiveWeight(0); walk.paused = true;
    root.userData = { hero: true, mixer, idle, walk, B, crouchQ, crouchFoot, abQ, drop, main, vest, cr: 0, mv: 0, lastWalk: 0, rot: 0 };
    onReady(root);
  }, undefined, () => {});
}
export function poseHero(s, p, dt) {
  const u = s.userData, B = u.B;
  u.cr += ((p.st ? 1 : 0) - u.cr) * Math.min(1, dt * 14);
  const moving = (p.walk || 0) !== u.lastWalk && (p.walk || 0) !== 0; u.lastWalk = p.walk || 0;
  u.mv += ((moving ? 1 : 0) - u.mv) * Math.min(1, dt * 10);
  const c = u.cr, wd = u.walk.getClip().duration;
  u.walk.time = (((p.walk || 0) / (Math.PI * 2)) % 1 + 1) % 1 * wd;
  u.walk.setEffectiveWeight(u.mv * (1 - c * 0.85)); u.idle.setEffectiveWeight(1 - u.mv * (1 - c * 0.85));
  u.mixer.update(dt);
  if (c > 0.001) {
    for (const n in u.crouchQ) B[n].quaternion.slerp(u.crouchQ[n], c);
    B.Abdomen.quaternion.slerp(u.abQ, c);
    for (const sd of ["L", "R"]) B["Foot" + sd].position.lerp(u.crouchFoot[sd], c);
    s.children[0].position.y = -u.drop * c;
  } else s.children[0].position.y = 0;
  const want = (p.dir || 1) * Math.PI / 2 * (0.35 + 0.65 * u.mv);   // идёт — боком, стоит — вполоборота к морю
  u.rot += (want - u.rot) * Math.min(1, dt * 10); s.rotation.y = u.rot;
}

export function createR3D(glCanvas) {
  const renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: true, powerPreference: "high-performance" });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(55, 1, 2, 9000);
  const fcam = new THREE.PerspectiveCamera(30, 1, 5, 9000);      // фронтальная: проекция задаётся вручную
  scene.fog = new THREE.Fog("#cfe6ff", 900, 5200);

  const hemi = new THREE.HemisphereLight("#cfe8ff", "#b48a55", 1); scene.add(hemi);
  const sun = new THREE.DirectionalLight("#fff", 2.4); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 1024);
  Object.assign(sun.shadow.camera, { left: -260, right: 260, top: 140, bottom: -140, near: 50, far: 2000 });
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.6;
  scene.add(sun); scene.add(sun.target); sun.target.position.set(WW / 2, 0, 0);

  // небо
  const skyGeo = new THREE.SphereGeometry(6000, 32, 16);
  const skyMat = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color() }, bot: { value: new THREE.Color() } },
    vertexShader: "varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }",
    fragmentShader: "uniform vec3 top; uniform vec3 bot; varying vec3 vP; void main(){ float k = smoothstep(-0.02, 0.45, vP.y); gl_FragColor = vec4(mix(bot, top, k), 1.); }" });
  const sky = new THREE.Mesh(skyGeo, skyMat); scene.add(sky);

  const world = new THREE.Group(); scene.add(world);             // всё, что зависит от карты
  let built = null, theme = -1, atlas = null, atlasTex = null, atlasMats = [], coverMeshes = [];
  let soldier = makeSoldier("#ef4444"); scene.add(soldier);
  const xrScene = new THREE.Scene(), xrHemi = new THREE.HemisphereLight(), xrSun = new THREE.DirectionalLight(); xrScene.add(xrHemi, xrSun, xrSun.target);
  loadHero((h) => { h.visible = soldier.visible; scene.remove(soldier); soldier = h; scene.add(h); });
  const ringMat = new THREE.MeshBasicMaterial({ color: "#22c55e", transparent: true, opacity: 0.85, depthWrite: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(13, 17, 32), ringMat); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.6; scene.add(ring);
  // деньги
  const cashGeo = new THREE.BoxGeometry(14, 4, 8), cashMat = new THREE.MeshStandardMaterial({ color: "#22a35a", roughness: 0.5, emissive: "#0b3d1f", emissiveIntensity: 0.6 });
  const bandMat = new THREE.MeshStandardMaterial({ color: "#f3f0d8" });
  const cash = []; let cashFor = null;
  // остров снайпера
  const island = new THREE.Group(); scene.add(island);
  const glintMat = new THREE.SpriteMaterial({ map: canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.25, "rgba(255,240,200,.8)"); gr.addColorStop(1, "rgba(255,240,200,0)"); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); g.fillStyle = "rgba(255,255,255,.9)"; g.fillRect(0, 31, 64, 2); g.fillRect(31, 0, 2, 64); }), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const glint = new THREE.Sprite(glintMat); glint.scale.set(60, 60, 1); island.add(glint);
  let muzzleT = 0;
  // пена и вода
  let sea = null, foam = [];

  function buildWorld(map) {
    while (world.children.length) { const o = world.children.pop(); o.traverse((m) => { if (m.geometry) m.geometry.dispose(); }); }
    island.clear(); island.add(glint); coverMeshes = []; atlasMats = []; foam = [];
    const TH = THEMES[map.theme || 0]; theme = map.theme || 0;
    hemi.color.set(TH.sky[1]); hemi.groundColor.set(TH.sandDark); hemi.intensity = TH.hemi;
    sun.color.set(TH.sun); sun.intensity = TH.sunI; sun.position.set(WW / 2 + TH.sunPos[0], TH.sunPos[1], TH.sunPos[2]);
    skyMat.uniforms.top.value.set(TH.sky[0]); skyMat.uniforms.bot.value.set(TH.sky[1]);
    scene.fog.color.set(TH.fog);

    // атлас
    atlas = document.createElement("canvas"); atlas.width = WW * AR; atlas.height = HM * AR;
    drawAtlas(atlas.getContext("2d"), map, TH);
    atlasTex = new THREE.CanvasTexture(atlas); atlasTex.colorSpace = THREE.SRGBColorSpace; atlasTex.anisotropy = 8;
    atlasTex.generateMipmaps = false; atlasTex.minFilter = THREE.LinearFilter;
    const atlasMat = () => { const m = new THREE.MeshStandardMaterial({ map: atlasTex, alphaTest: 0.5, roughness: 0.92 }); atlasMats.push(m); return m; };

    const sideBrick = new THREE.MeshStandardMaterial({ map: brickTile(TH.brickH), roughness: 0.95 });
    const sideWood = new THREE.MeshStandardMaterial({ map: woodTile(), roughness: 0.85 });
    const sideBag = new THREE.MeshStandardMaterial({ map: noiseTile("#c9b27e", "rgba(90,70,35,.5)"), roughness: 1 });
    const capMat = new THREE.MeshStandardMaterial({ color: "#8a6247", roughness: 0.9 });
    const metal = new THREE.MeshStandardMaterial({ color: "#2f5a38", roughness: 0.45, metalness: 0.4 });

    // плоские UV лицевых граней: u = x/WW, v = Y/HM (по мировым координатам)
    const planarUV = (geo, mesh, pick, clamp) => {
      const pos = geo.attributes.position, uv = geo.attributes.uv, v = new THREE.Vector3();
      mesh.updateMatrixWorld(true);
      for (let i = 0; i < pos.count; i++) {
        if (pick && !pick(i)) continue;
        v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
        let X = v.x, Y = v.y; if (clamp) { X = Math.min(clamp[1], Math.max(clamp[0], X)); Y = Math.min(clamp[3], Math.max(clamp[2], Y)); }
        uv.setXY(i, X / WW, Y / HM);
      }
      uv.needsUpdate = true;
    };
    const faceRange = (geo, gi) => { const gr = geo.groups[gi], idx = geo.index; const set = new Set(); for (let k = gr.start; k < gr.start + gr.count; k++) set.add(idx.getX(k)); return (i) => set.has(i); };
    const repeatBox = (geo, sx, sy, sz, s) => {      // для боковых плиток — повтор по размеру
      const uv = geo.attributes.uv; for (let gi = 0; gi < 4; gi++) { const f = faceRange(geo, gi), g = geo.groups[gi];
        for (let i = 0; i < uv.count; i++) if (f(i)) { const sc = gi < 2 ? [sz, sy] : [sx, sz]; uv.setXY(i, uv.getX(i) * sc[0] / s, uv.getY(i) * sc[1] / s); } }
      uv.needsUpdate = true;
    };

    for (const c of map.covers) {
      const depth = c.kind === "wall" ? 9 : c.kind === "crate" ? 13 : c.kind === "sand" ? 15 : 13;
      let mesh;
      if (c.kind === "barrel") {
        const geo = new THREE.CylinderGeometry(c.w / 2, c.w / 2, c.h, 28, 1);
        mesh = new THREE.Mesh(geo, [atlasMat(), metal, metal]);
        mesh.scale.z = depth / c.w; mesh.position.set(c.x + c.w / 2, c.h / 2, 0);
        planarUV(geo, mesh, faceRange(geo, 0), [c.x + 0.3, c.x + c.w - 0.3, 0.3, c.h - 0.3]);
        const ringG = new THREE.TorusGeometry(c.w / 2 + 0.3, 0.9, 6, 28);
        for (const yy of [c.h * 0.27, c.h * 0.73]) { const t = new THREE.Mesh(ringG, metal); t.rotation.x = Math.PI / 2; t.scale.set(1, depth / c.w, 1); t.position.set(c.x + c.w / 2, yy, 0); t.castShadow = true; world.add(t); }
      } else {
        const geo = new THREE.BoxGeometry(c.w, c.h, depth);
        const side = c.kind === "wall" ? sideBrick : c.kind === "crate" ? sideWood : sideBag;
        const top = c.kind === "wall" ? capMat : side;
        mesh = new THREE.Mesh(geo, [side, side, top, top, atlasMat(), atlasMat()]);
        mesh.position.set(c.x + c.w / 2, c.h / 2, 0);
        repeatBox(geo, c.w, c.h, depth, c.kind === "wall" ? 34 : 40);
        const front = faceRange(geo, 4), back = faceRange(geo, 5);
        planarUV(geo, mesh, (i) => front(i) || back(i));
        if (c.kind === "wall") {
          const cap = new THREE.Mesh(new THREE.BoxGeometry(c.w + 6, 5, depth + 5), capMat); cap.position.set(c.x + c.w / 2, c.h + 2.5, 0); cap.castShadow = cap.receiveShadow = true; world.add(cap);
          for (const o of c.open) if (o.t === "r") {     // подоконник
            const sill = new THREE.Mesh(new THREE.BoxGeometry(o.w + 6, 2.4, depth + 6), new THREE.MeshStandardMaterial({ color: "#6b4a2a", roughness: 0.8 }));
            sill.position.set(o.x + o.w / 2, G - (o.y + o.h) - 1.2, 0); sill.castShadow = true; world.add(sill);
          }
        }
        if (c.kind === "sand") {                     // верхний ряд мешков — объёмный
          const bagG = new THREE.SphereGeometry(1, 14, 8), r = rng(c.seed + 9);
          for (let k = 0; k < c.w / 18; k++) { const b = new THREE.Mesh(bagG, sideBag); b.scale.set(9.6, 4.2, depth / 2 + 0.5); b.position.set(c.x + 9 + k * 18, c.h - 1.5, (r() - 0.5) * 1.5); b.rotation.z = (r() - 0.5) * 0.15; b.castShadow = true; world.add(b); }
        }
      }
      mesh.castShadow = mesh.receiveShadow = true; world.add(mesh); coverMeshes.push(mesh);
      // тень-«контакт» на земле
    }

    // земля
    const sandTex = noiseTile(TH.sand, "rgba(120,80,40,.45)", 5000); sandTex.repeat.set(30, 30);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(2400, 1400), new THREE.MeshStandardMaterial({ map: sandTex, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.position.set(WW / 2, 0, -650); ground.receiveShadow = true; world.add(ground);
    const wet = new THREE.Mesh(new THREE.PlaneGeometry(2400, 30), new THREE.MeshStandardMaterial({ color: TH.sandDark, roughness: 0.5, transparent: true, opacity: 0.8 }));
    wet.rotation.x = -Math.PI / 2; wet.position.set(WW / 2, 0.15, 48); world.add(wet);
    sea = new THREE.Mesh(new THREE.PlaneGeometry(9000, 6000, 1, 1), new THREE.MeshPhongMaterial({ color: TH.sea, specular: "#ffffff", shininess: 90, emissive: TH.seaDeep, emissiveIntensity: 0.25 }));
    sea.rotation.x = -Math.PI / 2; sea.position.set(WW / 2, -0.8, 3050); world.add(sea);
    const foamMat = new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.6, depthWrite: false });
    for (let k = 0; k < 3; k++) { const f = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2.2), foamMat.clone()); f.rotation.x = -Math.PI / 2; f.position.set(WW / 2, 0.3, 64 + k * 9); f.userData.k = k; world.add(f); foam.push(f); }

    const r = rng(map.seed + 7);
    // ежи на пляже
    const hedgeMat = new THREE.MeshStandardMaterial({ color: "#5d4632", roughness: 0.6, metalness: 0.5 });
    for (let i = 0; i < 4; i++) {
      const h = new THREE.Group(); const bg = new THREE.BoxGeometry(2.6, 26, 2.6);
      [[0, 0, 0.8], [0, Math.PI / 2, 0.8], [Math.PI / 2, 0, 0]].forEach(([ax, ay, az]) => { const b = new THREE.Mesh(bg, hedgeMat); b.rotation.set(ax, ay, az); b.castShadow = true; h.add(b); });
      h.position.set(i < 2 ? -30 - r() * 60 : WW + 30 + r() * 60, 9, 18 + r() * 22); h.rotation.y = r() * 3; world.add(h);
    }
    // дюны, пальмы, руины позади
    const duneMat = new THREE.MeshStandardMaterial({ color: TH.sand, roughness: 1 });
    for (let i = 0; i < 9; i++) { const d = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12), duneMat); d.scale.set(160 + r() * 220, 40 + r() * 70, 90 + r() * 80); d.position.set(-500 + i * 170 + r() * 60, -10, -380 - r() * 420); d.receiveShadow = true; world.add(d); }
    const trunkMat = new THREE.MeshStandardMaterial({ color: "#8a6a45", roughness: 1 }), leafMat = new THREE.MeshStandardMaterial({ color: "#3f8a3a", roughness: 0.8, side: THREE.DoubleSide });
    const leafGeo = new THREE.PlaneGeometry(9, 46, 1, 6); { const p = leafGeo.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i) + 23; p.setZ(i, -(y * y) / 70); p.setX(i, p.getX(i) * (1 - Math.abs(y - 20) / 30)); } leafGeo.translate(0, 23, 0); leafGeo.computeVertexNormals(); }
    for (let i = 0; i < 7; i++) {
      const palm = new THREE.Group(); let px = 0, py = 0; const lean = (r() - 0.5) * 0.5;
      for (let s = 0; s < 8; s++) { const seg = new THREE.Mesh(new THREE.CylinderGeometry(3.2 - s * 0.2, 3.6 - s * 0.2, 13, 8), trunkMat); seg.position.set(px, py + 6.5, 0); seg.rotation.z = -lean * 0.6; seg.castShadow = true; palm.add(seg); px += lean * 4 * (s / 4); py += 12.5; }
      for (let l = 0; l < 8; l++) { const leaf = new THREE.Mesh(leafGeo, leafMat); leaf.position.set(px, py, 0); leaf.rotation.set(-0.9 - r() * 0.3, l * Math.PI / 4 + r() * 0.3, 0, "YXZ"); leaf.castShadow = true; palm.add(leaf); }
      const side = i % 2 ? 1 : -1;
      palm.position.set(-260 + r() * 880, 0, -420 - r() * 300); palm.scale.setScalar(0.9 + r() * 0.5); world.add(palm);
      void side;
    }
    const stoneMat = new THREE.MeshStandardMaterial({ color: "#b49a78", roughness: 1 });
    for (let i = 0; i < 4; i++) { const col = new THREE.Mesh(new THREE.CylinderGeometry(7, 8, 30 + r() * 50, 10), stoneMat); col.position.set(-120 + r() * 600, 15, -160 - r() * 160); col.rotation.z = (r() - 0.5) * 0.3; col.castShadow = true; world.add(col); }
    // облака
    const cloudMat = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 1, emissive: "#ffffff", emissiveIntensity: 0.35, fog: false });
    for (let i = 0; i < 9; i++) { const cl = new THREE.Group(); for (let k = 0; k < 4; k++) { const b = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), cloudMat); b.scale.set(60 + r() * 50, 20 + r() * 14, 40); b.position.set(k * 50, r() * 12, r() * 20); cl.add(b); } cl.position.set(-1200 + r() * 2800, 520 + r() * 380, (r() < 0.5 ? -1 : 1) * (1500 + r() * 2200)); world.add(cl); }

    // остров снайпера (виден прячущемуся)
    const ix = 40 + map.deco * 280;
    const isl = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 12), new THREE.MeshStandardMaterial({ color: TH.sand, roughness: 1 }));
    isl.scale.set(150, 14, 70); isl.position.set(ix, -6, DS); island.add(isl);
    for (const dx of [-80, -55, 40, 70]) { const b = new THREE.Mesh(new THREE.BoxGeometry(20, 16 + Math.abs(dx) * 0.2, 14), new THREE.MeshStandardMaterial({ color: "#8a5a3c" })); b.position.set(ix + dx, 10, DS - 20); island.add(b); }
    for (let i = 0; i < 2; i++) { const pm = new THREE.Group(); const t = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 3, 70, 6), trunkMat); t.position.y = 35; pm.add(t); for (let l = 0; l < 7; l++) { const leaf = new THREE.Mesh(leafGeo, leafMat); leaf.position.y = 70; leaf.rotation.set(-1, l * 0.9, 0, "YXZ"); pm.add(leaf); } pm.position.set(ix + (i ? 105 : -110), 0, DS + 10); island.add(pm); }
    const sn = new THREE.Mesh(new THREE.BoxGeometry(30, 7, 9), new THREE.MeshStandardMaterial({ color: "#2b2b2b" })); sn.position.set(ix - 6, 10, DS - 34); island.add(sn);
    glint.position.set(ix - 6, 16, DS - 42);
    built = map;
  }

  function redrawAtlas(map) { if (!atlas) return; drawAtlas(atlas.getContext("2d"), map, THEMES[theme]); atlasTex.needsUpdate = true; }

  function syncCash(R, t) {
    const list = R ? R.pickups : null;
    if (list !== cashFor) {
      cash.forEach((m) => scene.remove(m)); cash.length = 0; cashFor = list;
      if (list) for (const p of list) { const g = new THREE.Group(); const a = new THREE.Mesh(cashGeo, cashMat); a.castShadow = true; g.add(a); const b = new THREE.Mesh(new THREE.BoxGeometry(3, 4.4, 8.4), bandMat); g.add(b); const a2 = a.clone(); a2.position.y = 4.2; a2.rotation.y = 0.3; g.add(a2); g.position.set(p.x, 3, ZH); scene.add(g); cash.push(g); }
    }
    if (list) list.forEach((p, i) => { const g = cash[i]; if (!g) return; g.visible = !p.taken; g.rotation.y = t * 2 + p.x; g.position.y = 4 + Math.sin(t * 4 + p.x) * 1.5; });
  }

  let W = 1, H = 1;
  function setSize(w, h, dpr) { W = w; H = h; renderer.setPixelRatio(dpr); renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); }

  // фронтальная камера: плоскость человечка (z = ZH) ложится на экран как screen = o + world*sc (2D y вниз)
  function frontCam(sc, ox, oy, camX, camY, D) {
    const xl = -ox / sc, xr = (W - ox) / sc, yt = G - (-oy / sc), yb = G - (H - oy) / sc;
    const n = 5, k = n / D;
    fcam.position.set(camX, camY, ZH + D); fcam.rotation.set(0, 0, 0); fcam.updateMatrixWorld();
    fcam.projectionMatrix.makePerspective((xl - camX) * k, (xr - camX) * k, (yt - camY) * k, (yb - camY) * k, n, 9000);
    fcam.projectionMatrixInverse.copy(fcam.projectionMatrix).invert();
    return fcam;
  }
  let active = cam;
  const tmp = new THREE.Vector3();
  function project(x, y, z) { tmp.set(x, G - y, z == null ? ZH : z).project(active); return { x: (tmp.x + 1) / 2 * W, y: (1 - tmp.y) / 2 * H, behind: tmp.z > 1 }; }

  // o: { map, dirtyAtlas, view: "front"|"hider"|"dark", sc, ox, oy, camOff:[dx,dy], D, hider:{x,st,dir,walk}|null, hiderColor, R, t, dt, camX, shake, ring:"#hex"|null, reveal, live }
  function draw(o) {
    if (!o.map) return;
    if (o.map !== built || (o.map.theme || 0) !== theme) buildWorld(o.map);
    else if (o.dirtyAtlas) redrawAtlas(o.map);
    const t = o.t, dt = o.dt;
    // вода
    foam.forEach((f) => { const k = f.userData.k; f.position.z = 60 + k * 9 + Math.sin(t * 0.9 + k * 1.7) * 5; f.material.opacity = 0.35 + 0.3 * Math.sin(t * 0.9 + k * 1.7 + 1); });
    // человечек
    if (o.hider) { soldier.visible = true; soldier.position.set(o.hider.x, 0, ZH);
      const col = o.hiderColor || "#ef4444", u = soldier.userData;
      if (u.hero) { poseHero(soldier, o.hider, dt); if (u.col !== col) { u.col = col; if (u.main) u.main.color.set(col); if (u.vest) u.vest.color.set(col).multiplyScalar(0.28); } }
      else { poseSoldier(soldier, o.hider, dt); if (u.col !== col) { u.col = col; u.chest.material.color.set(col); u.arms.forEach((a) => a.children[0].material.color.set(col)); } } }
    else soldier.visible = false;
    ring.visible = !!(o.ring && o.hider); if (ring.visible) { ring.position.set(o.hider.x, 0.6, ZH); ringMat.color.set(o.ring); ringMat.opacity = 0.6 + 0.3 * Math.sin(t * 6); }
    syncCash(o.R, t);
    const xr = !!o.reveal;                                  // разбор раунда: человечка видно сквозь стены
    // остров и блик
    island.visible = o.view === "hider" || o.view === "front" && !o.scope;
    glint.visible = !!o.live && o.view === "hider" && Math.sin(t * 5) > 0.55;
    if (muzzleT > 0) { muzzleT -= dt; glint.visible = true; glint.scale.setScalar(140); } else glint.scale.setScalar(70);

    if (o.view === "dark") { renderer.setClearColor("#05080f"); renderer.clear(); return; }
    if (o.view === "hider") {
      const sx = (Math.random() - 0.5) * o.shake * 10, sy = (Math.random() - 0.5) * o.shake * 10;
      const aspect = W / H, fit = Math.max(1, 0.62 / aspect);   // узкий экран — отъезжаем назад
      cam.fov = 52; cam.updateProjectionMatrix();
      cam.position.set(o.camX + sx, 120 * fit + sy, ZH - 230 * fit);
      cam.lookAt(o.camX, 26, ZH + 70);
      active = cam;
      scene.fog.near = 900; scene.fog.far = 5200;
    } else {
      const off = o.camOff || [0, 0];
      const cx = (W / 2 - o.ox) / o.sc;                       // центр экрана в мире
      const camY = Math.max(22, G - (H * 0.5 - o.oy) / o.sc + off[1]);
      active = frontCam(o.sc, o.ox, o.oy, cx + off[0], camY, o.D || DS);
      scene.fog.near = (o.D || DS) + 250; scene.fog.far = (o.D || DS) + 5200;
    }
    sky.position.copy(active.position);
    if (xr && soldier.visible) {                            // человечек — вторым проходом поверх стен, без каши из прозрачностей
      scene.remove(soldier); renderer.render(scene, active);
      xrHemi.color.copy(hemi.color); xrHemi.groundColor.copy(hemi.groundColor); xrHemi.intensity = hemi.intensity;
      xrSun.color.copy(sun.color); xrSun.intensity = sun.intensity; xrSun.position.copy(sun.position); xrSun.target.position.copy(sun.target.position);
      xrScene.add(soldier); const ac = renderer.autoClear; renderer.autoClear = false; renderer.clearDepth(); renderer.render(xrScene, active); renderer.autoClear = ac;
      xrScene.remove(soldier); scene.add(soldier);
    } else renderer.render(scene, active);
  }

  return { draw, project, setSize, muzzle() { muzzleT = 0.18; }, get ZH() { return ZH; } };
}
