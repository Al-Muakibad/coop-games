// Общая 3D-часть: рендерер, люди (низкополигональные, плоская заливка), подписи, текстуры.
import * as THREE from "three";
export { THREE };

export const canvas = document.getElementById("view");
export const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

export function resize(cam) {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  if (cam) { cam.aspect = w / h; cam.updateProjectionMatrix(); }
}

const matCache = new Map();
export function mat(col, o = {}) {
  const key = col + JSON.stringify(o);
  if (matCache.has(key)) return matCache.get(key);
  const m = o.std ? new THREE.MeshStandardMaterial({ color: col, roughness: o.r ?? 0.6, metalness: o.m ?? 0, emissive: o.e || 0, emissiveIntensity: o.ei ?? 1, flatShading: !!o.flat })
    : new THREE.MeshLambertMaterial({ color: col, emissive: o.e || 0, emissiveIntensity: o.ei ?? 1, flatShading: o.flat !== false, transparent: !!o.tr, opacity: o.op ?? 1 });
  matCache.set(key, m);
  return m;
}

/* ---------- текстуры, нарисованные на canvas ---------- */
export function canvasTex(w, h, draw, rep) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); }
  return t;
}
export function rnd(seed) { let s = seed >>> 0 || 1; return () => ((s = Math.imul(s ^ (s >>> 15), 2246822507) ^ Math.imul(s ^ (s >>> 13), 3266489909), (s ^= s >>> 16) >>> 0) / 4294967296); }

export function cobbleTex() {
  return canvasTex(512, 512, (g, w, h) => {
    const r = rnd(7);
    g.fillStyle = "#1c1a24"; g.fillRect(0, 0, w, h);
    const s = 32;
    for (let y = 0; y < h; y += s) for (let x = -s; x < w; x += s) {
      const ox = (y / s) % 2 ? s / 2 : 0;
      const l = 30 + r() * 14, sat = 8 + r() * 8;
      g.fillStyle = `hsl(${245 + r() * 30},${sat}%,${l}%)`;
      g.beginPath(); g.roundRect(x + ox + 2, y + 2, s - 4, s - 4, 8); g.fill();
      g.fillStyle = "rgba(255,255,255,.05)"; g.beginPath(); g.roundRect(x + ox + 5, y + 4, s - 12, 6, 4); g.fill();
    }
    // лужи
    for (let i = 0; i < 6; i++) { g.fillStyle = "rgba(90,70,140,.18)"; g.beginPath(); g.ellipse(r() * w, r() * h, 30 + r() * 50, 14 + r() * 20, r() * 3, 0, 7); g.fill(); }
  }, [14, 7]);
}
export function brickTex(tint = "#5a2a26") {
  return canvasTex(512, 256, (g, w, h) => {
    const r = rnd(3);
    g.fillStyle = "#24161a"; g.fillRect(0, 0, w, h);
    const bw = 64, bh = 24;
    for (let y = 0; y < h; y += bh) for (let x = -bw; x < w; x += bw) {
      const ox = (y / bh) % 2 ? bw / 2 : 0;
      const c = new THREE.Color(tint); c.offsetHSL((r() - 0.5) * 0.03, 0, (r() - 0.5) * 0.12);
      g.fillStyle = "#" + c.getHexString();
      g.fillRect(x + ox + 2, y + 2, bw - 4, bh - 4);
    }
  }, [4, 2]);
}

export const GLOW = canvasTex(128, 128, (g, w, h) => { const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.35, "rgba(255,255,255,.45)"); gr.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
/* ---------- подписи-спрайты ---------- */
export function label(text, o = {}) {
  const fs = o.fs || 44, pad = 18;
  const c = document.createElement("canvas"); const g = c.getContext("2d");
  g.font = `900 ${fs}px Rubik, Nunito, sans-serif`;
  const lines = String(text).split("\n");
  const w = Math.ceil(Math.max(...lines.map((l) => g.measureText(l).width))) + pad * 2;
  const h = lines.length * fs * 1.15 + pad * 1.3;
  c.width = w; c.height = h;
  g.font = `900 ${fs}px Rubik, Nunito, sans-serif`;
  if (o.bg !== false) { g.fillStyle = o.bg || "rgba(20,10,24,.78)"; g.beginPath(); g.roundRect(0, 0, w, h, Math.min(28, h / 2)); g.fill(); if (o.stroke) { g.strokeStyle = o.stroke; g.lineWidth = 4; g.stroke(); } }
  g.fillStyle = o.col || "#fff"; g.textAlign = "center"; g.textBaseline = "middle";
  lines.forEach((l, i) => g.fillText(l, w / 2, pad * 0.65 + fs * 0.6 + i * fs * 1.15));
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: o.depth ?? false, transparent: true }));
  const sc = (o.size || 0.5) / fs;
  sp.scale.set(w * sc, h * sc, 1);
  sp.renderOrder = o.order ?? 10;
  return sp;
}

/* ---------- люди ---------- */
const G = {
  leg: new THREE.CylinderGeometry(0.075, 0.06, 0.62, 6).translate(0, -0.31, 0),
  torso: new THREE.CylinderGeometry(0.2, 0.24, 0.62, 7).translate(0, 0.31, 0),
  arm: new THREE.CylinderGeometry(0.06, 0.05, 0.5, 5).translate(0, -0.25, 0),
  head: new THREE.IcosahedronGeometry(0.2, 1),
  dress: new THREE.CylinderGeometry(0.16, 0.42, 0.78, 9, 1, true).translate(0, -0.1, 0),
  bodice: new THREE.CylinderGeometry(0.15, 0.17, 0.42, 8).translate(0, 0.44, 0),
  capBrim: new THREE.CylinderGeometry(0.26, 0.26, 0.03, 10),
  capTop: new THREE.CylinderGeometry(0.19, 0.21, 0.12, 10),
  topHat: new THREE.CylinderGeometry(0.15, 0.15, 0.32, 10),
  bob: new THREE.SphereGeometry(0.235, 12, 8, Math.PI * 0.5 + Math.PI * 0.32, Math.PI * 1.36, 0, Math.PI * 0.62),
  fringe: new THREE.SphereGeometry(0.236, 12, 4, 0, Math.PI * 2, 0, Math.PI * 0.2),
  long: new THREE.CylinderGeometry(0.2, 0.16, 0.5, 9, 1, true, Math.PI * 0.32, Math.PI * 1.36).translate(0, -0.22, 0),
  bun: new THREE.SphereGeometry(0.11, 8, 6),
  curl: new THREE.IcosahedronGeometry(0.09, 0),
  shoe: new THREE.BoxGeometry(0.1, 0.06, 0.2).translate(0, -0.6, 0.04),
  scarf: new THREE.TorusGeometry(0.17, 0.05, 5, 10),
  bottle: new THREE.CylinderGeometry(0.06, 0.07, 0.3, 7),
  neck: new THREE.CylinderGeometry(0.025, 0.04, 0.12, 6),
  eye: new THREE.SphereGeometry(0.028, 5, 4),
};
const SKIN = ["#f1c7a5", "#e3b08a", "#c98b62", "#f6d5bd", "#a8714c"];

// kind: "man" | "girl"; o: { coat, hat, hatType: cap|top|sailor|none, skin, dress, hair, style, scarf }
export function person(kind, o = {}) {
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  const skin = mat(o.skin || SKIN[0]);
  const parts = { root, body, legs: [], arms: [], t: Math.random() * 6, kind };
  const legMat = mat(kind === "girl" ? (o.skin || SKIN[0]) : (o.pants || "#23202a"));
  for (const sx of [-0.1, 0.1]) {
    const l = new THREE.Group(); l.position.set(sx, 0.64, 0);
    const lm = new THREE.Mesh(G.leg, legMat); lm.castShadow = true; l.add(lm);
    const sh = new THREE.Mesh(G.shoe, mat(kind === "girl" ? (o.dress || "#c00") : "#111")); l.add(sh);
    body.add(l); parts.legs.push(l);
  }
  if (kind === "girl") {
    const dm = mat(o.dress || "#d7263d", { flat: true });
    const dress = new THREE.Mesh(G.dress, dm); dress.position.y = 0.95; dress.castShadow = true; body.add(dress);
    const bod = new THREE.Mesh(G.bodice, dm); bod.position.y = 0.95; bod.castShadow = true; body.add(bod);
  } else {
    const t = new THREE.Mesh(G.torso, mat(o.coat || "#444")); t.position.y = 0.62; t.castShadow = true; body.add(t);
  }
  const shY = kind === "girl" ? 1.33 : 1.22;
  for (const sx of [-1, 1]) {
    const a = new THREE.Group(); a.position.set(sx * (kind === "girl" ? 0.18 : 0.25), shY, 0);
    const am = new THREE.Mesh(G.arm, kind === "girl" ? skin : mat(o.coat || "#444")); am.castShadow = true; a.add(am);
    a.rotation.z = sx * 0.12;
    body.add(a); parts.arms.push(a);
  }
  const head = new THREE.Group(); head.position.y = shY + 0.26; body.add(head); parts.head = head;
  const hm = new THREE.Mesh(G.head, skin); hm.castShadow = true; head.add(hm);
  for (const sx of [-0.07, 0.07]) { const e = new THREE.Mesh(G.eye, mat("#1a1018")); e.position.set(sx, 0.03, 0.17); head.add(e); }
  if (kind === "girl") {
    const hc = mat(o.hair || "#222");
    const top = new THREE.Mesh(G.bob, hc); top.position.y = 0.02; head.add(top); const fr = new THREE.Mesh(G.fringe, hc); fr.position.y = 0.025; fr.rotation.x = 0.35; head.add(fr);
    if (o.style === "long") { const l = new THREE.Mesh(G.long, hc); l.position.set(0, 0.02, -0.06); head.add(l); }
    if (o.style === "bob") { const l = new THREE.Mesh(G.long, hc); l.scale.set(1.15, 0.45, 1.1); l.position.set(0, 0.0, -0.03); head.add(l); }
    if (o.style === "bun") { const b = new THREE.Mesh(G.bun, hc); b.position.set(0, 0.18, -0.12); head.add(b); }
    if (o.style === "curls") for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; if (Math.sin(a) > 0.5) continue; const c = new THREE.Mesh(G.curl, hc); c.position.set(Math.cos(a) * 0.21, -0.05 + (i % 2) * 0.08, Math.sin(a) * 0.21 - 0.03); head.add(c); }
    const lip = new THREE.Mesh(G.eye, mat("#b0102a")); lip.scale.set(1.4, 0.6, 0.6); lip.position.set(0, -0.08, 0.18); head.add(lip);
  } else {
    if (o.hatType === "top") { const b = new THREE.Mesh(G.capBrim, mat(o.hat || "#111")); b.position.y = 0.13; head.add(b); const t = new THREE.Mesh(G.topHat, mat(o.hat || "#111")); t.position.y = 0.3; head.add(t); }
    else if (o.hatType === "sailor") { const t = new THREE.Mesh(G.capTop, mat(o.hat || "#fff")); t.scale.set(1.15, 1, 1.15); t.position.y = 0.17; head.add(t); const b = new THREE.Mesh(G.capBrim, mat("#1a1a2a")); b.scale.set(0.8, 1, 0.8); b.position.y = 0.12; head.add(b); }
    else if (o.hatType !== "none") { const b = new THREE.Mesh(G.capBrim, mat(o.hat || "#333")); b.position.set(0, 0.13, 0.05); b.scale.set(0.95, 1, 1.15); head.add(b); const t = new THREE.Mesh(G.capTop, mat(o.hat || "#333")); t.position.y = 0.19; head.add(t); }
    if (o.scarf) { const s = new THREE.Mesh(G.scarf, mat(o.scarf)); s.rotation.x = Math.PI / 2; s.position.y = shY + 0.03; body.add(s); }
  }
  return parts;
}

// анимация: speed (0..1+) — бег; pose: "idle" | "lean" | "wave" | "carry"
export function animPerson(p, dt, speed, pose) {
  p.t += dt * (speed > 0.05 ? 9 * Math.min(1.3, 0.6 + speed) : 2);
  const s = Math.min(1, speed);
  const sw = Math.sin(p.t) * 0.7 * s;
  p.legs[0].rotation.x = sw; p.legs[1].rotation.x = -sw;
  p.body.position.y = Math.abs(Math.sin(p.t)) * 0.07 * s;
  const ar = pose === "carry" ? -1.2 : -sw * 0.8;
  p.arms[0].rotation.x = ar; p.arms[1].rotation.x = pose === "carry" ? -1.2 : sw * 0.8;
  if (pose === "wave") { p.arms[1].rotation.x = -2.6 + Math.sin(p.t * 3) * 0.3; p.arms[1].rotation.z = 0.3; }
  else p.arms[1].rotation.z = 0.12;
  if (pose === "lean") { p.body.rotation.x = -0.12; p.arms[0].rotation.x = 0.4; p.arms[0].rotation.z = -0.5; p.legs[1].rotation.x = -0.5; p.body.rotation.z = Math.sin(p.t * 0.7) * 0.04; }
  else { p.body.rotation.x = s * 0.12; p.body.rotation.z = 0; }
  if (p.kind === "girl" && s < 0.05 && pose !== "lean") p.body.rotation.y = Math.sin(p.t * 0.9) * 0.12;
  else p.body.rotation.y = 0;
}

export function bottle() {
  const g = new THREE.Group();
  const b = new THREE.Mesh(G.bottle, mat("#1f5a2a", { std: true, r: 0.2 })); g.add(b);
  const n = new THREE.Mesh(G.neck, mat("#d9a93a")); n.position.y = 0.2; g.add(n);
  return g;
}

// кольцо-площадка на земле с заполнением (для покупок и зон)
export function ring(r, col, o = {}) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.RingGeometry(r * 0.82, r, 40), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: o.op ?? 0.85, depthWrite: false }));
  base.rotation.x = -Math.PI / 2; g.add(base);
  const fillG = new THREE.CircleGeometry(r * 0.8, 40);
  const fill = new THREE.Mesh(fillG, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.22, depthWrite: false }));
  fill.rotation.x = -Math.PI / 2; fill.position.y = 0.005; g.add(fill);
  const prog = new THREE.Mesh(new THREE.RingGeometry(r * 0.5, r * 0.8, 40, 1, Math.PI / 2, 0.001), new THREE.MeshBasicMaterial({ color: "#fff", transparent: true, opacity: 0.8, depthWrite: false }));
  prog.rotation.x = -Math.PI / 2; prog.position.y = 0.01; g.add(prog);
  g.userData = { r, prog, base, fill };
  g.setProg = (f) => {
    f = Math.max(0, Math.min(1, f));
    if (Math.abs((g.userData.lastF ?? -1) - f) < 0.01) return;
    g.userData.lastF = f;
    prog.geometry.dispose();
    prog.geometry = new THREE.RingGeometry(r * 0.5, r * 0.8, 40, 1, Math.PI / 2, -Math.max(0.001, f * Math.PI * 2));
  };
  return g;
}

// стопка монет
const coinG = new THREE.CylinderGeometry(0.16, 0.16, 0.06, 10);
export function coinMesh() { const m = new THREE.Mesh(coinG, mat("#ffc83a", { std: true, m: 0.7, r: 0.35, e: "#5a3a00", ei: 0.4 })); m.castShadow = true; return m; }

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export function angLerp(a, b, t) { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return a + d * t; }
