// «Красный фонарь» v2 — картинка. Рисует «вид мира» (V) — одинаковый у хозяина и гостей.
import { THREE, renderer, resize, mat, person, animPerson, label, ring, coinMesh, bottle, brickTex, canvasTex, clamp, lerp, angLerp, rnd, GLOW } from "./c3d.js?v=3";
import { GIRL, CLIENTS, TYPES } from "./data.js?v=3";
import { ST, AREA, DOOR, QUEUE, PADS, front, placeSpot, canPlace, grabbable } from "./sim.js?v=3";

export const PCOL = ["#d7263d", "#3aa0e8", "#4ec26a", "#f2b01e"];

export function createView() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#140b16");
  const cam = new THREE.PerspectiveCamera(46, 1, 0.1, 140);
  const R = rnd(5);

  /* ---------- свет ---------- */
  scene.add(new THREE.HemisphereLight("#ffd9b8", "#3a1e2a", 1.15));
  const sun = new THREE.DirectionalLight("#ffe6c8", 0.9); sun.position.set(-6, 18, 8); sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024); Object.assign(sun.shadow.camera, { left: -11, right: 11, top: 11, bottom: -11, near: 1, far: 50 }); scene.add(sun);
  for (const [x, z, c] of [[-3, -1, "#ffb070"], [3, -1, "#ffb070"], [0, 3, "#ff8a8a"]]) { const l = new THREE.PointLight(c, 10, 11, 1.4); l.position.set(x, 3.4, z); scene.add(l);  }

  /* ---------- зал ---------- */
  const plank = canvasTex(256, 256, (g, w, h) => { const r = rnd(9); for (let y = 0; y < h; y += 32) { g.fillStyle = `hsl(${18 + r() * 8},${38 + r() * 10}%,${22 + r() * 7}%)`; g.fillRect(0, y, w, 31); g.fillStyle = "rgba(0,0,0,.35)"; g.fillRect(0, y + 31, w, 1); g.fillRect(((y / 32) % 2) * 128 + 60, y, 1, 31); } }, [8, 6]);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(12.6, 12.4), new THREE.MeshStandardMaterial({ map: plank, roughness: 0.55 })); floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, 0.6); floor.receiveShadow = true; scene.add(floor);
  // ковёр-дорожка от входа
  const rugT = canvasTex(64, 256, (g, w, h) => { g.fillStyle = "#6a0f22"; g.fillRect(0, 0, w, h); g.strokeStyle = "#d9a93a"; g.lineWidth = 4; g.strokeRect(5, 5, w - 10, h - 10); });
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 3), new THREE.MeshLambertMaterial({ map: rugT })); rug.rotation.x = -Math.PI / 2; rug.position.set(0, 0.01, 5.3); scene.add(rug);
  // улица снаружи
  const street = new THREE.Mesh(new THREE.PlaneGeometry(40, 10), mat("#1c1824")); street.rotation.x = -Math.PI / 2; street.position.set(0, -0.01, 11.8); scene.add(street);
  // стены
  const brick = new THREE.MeshLambertMaterial({ map: brickTex("#6a2a2a") });
  const wallN = new THREE.Mesh(new THREE.BoxGeometry(13, 5, 0.4), brick); wallN.position.set(0, 2.5, -5.8); wallN.receiveShadow = true; scene.add(wallN);
  const wallpaper = canvasTex(128, 128, (g, w, h) => { g.fillStyle = "#5a1a2a"; g.fillRect(0, 0, w, h); g.fillStyle = "#7a2a3a"; for (let y = 0; y < h; y += 32) for (let x = (y / 32) % 2 ? 16 : 0; x < w; x += 32) { g.beginPath(); g.ellipse(x + 8, y + 16, 5, 9, 0, 0, 7); g.fill(); } }, [6, 1.5]);
  const paper = new THREE.Mesh(new THREE.PlaneGeometry(12.6, 3), new THREE.MeshLambertMaterial({ map: wallpaper })); paper.position.set(0, 1.5, -5.58); scene.add(paper);
  for (const sx of [-1, 1]) { const w = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.4, 12.4), brick); w.position.set(sx * 6.5, 0.7, 0.6); scene.add(w); }
  for (const sx of [-1, 1]) { const w = new THREE.Mesh(new THREE.BoxGeometry(5.2, 1.4, 0.4), brick); w.position.set(sx * 3.9, 0.7, 6.9); scene.add(w); }
  const doorFr = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.3, 0.5), mat("#2a1418")); doorFr.position.set(0, 2.6, 6.9); scene.add(doorFr);
  const neonT = canvasTex(1024, 200, (g, w, h) => { g.font = "900 92px Rubik, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.shadowColor = "#ff2a5a"; g.shadowBlur = 30; g.fillStyle = "#ff6a8a"; g.fillText("КРАСНЫЙ ФОНАРЬ", w / 2, h / 2); g.shadowBlur = 6; g.fillStyle = "#ffe0e8"; g.fillText("КРАСНЫЙ ФОНАРЬ", w / 2, h / 2); });
  const neon = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.2), new THREE.MeshBasicMaterial({ map: neonT, transparent: true, depthWrite: false })); neon.position.set(0, 3.9, -5.55); scene.add(neon);
  // окна на северной стене
  for (const x of [-5, 5]) { const w = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.6), new THREE.MeshBasicMaterial({ color: "#2a3a6a" })); w.position.set(x, 3.4, -5.57); scene.add(w); }
  // площадки: Контора и Гардероб
  const pads = {};
  for (const [k, t, c] of [["office", "КОНТОРА 📒\nпокупки банды", "#ffd34d"], ["ward", "ГАРДЕРОБ 👔\nтвои чаевые", "#c08aff"]]) {
    const P = PADS[k], g = new THREE.Group(); g.position.set(P.x, 0.02, P.z);
    const r = ring(0.85, c, { op: 0.75 }); g.add(r);
    const lb = label(t, { fs: 30, size: 0.26, bg: "rgba(20,8,20,.85)", stroke: c }); lb.position.y = 1.2; g.add(lb);
    scene.add(g); pads[k] = g;
  }
  // очередь у входа
  const qr = ring(1.0, "#ff8fc7", { op: 0.45 }); qr.position.set(QUEUE.x + 0.6, 0.02, QUEUE.z); scene.add(qr);
  const ql = label("очередь гостей", { fs: 26, size: 0.22, bg: "rgba(20,8,20,.7)" }); ql.position.set(QUEUE.x + 0.6, 0.6, QUEUE.z + 1.1); scene.add(ql);

  /* ---------- сущности ---------- */
  const SM = {}, PM = {}, CM = {};
  const fx = [];
  function stationMesh(s) {
    const g = new THREE.Group(); const k = s.k; const o = { g, k };
    if (k === "room") {
      const back = new THREE.Mesh(new THREE.BoxGeometry(2, 2.0, 0.15), mat("#3a1420")); back.position.set(0, 1.0, -0.85); back.castShadow = true; g.add(back);
      for (const sx of [-1, 1]) { const sd = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.3, 1.8), mat("#4a1a26")); sd.position.set(sx * 0.95, 0.65, 0); sd.castShadow = true; g.add(sd); }
      const bed = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.45, 1.1), mat("#e8d8d0")); bed.position.set(0, 0.25, -0.2); g.add(bed);
      const bed2 = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.1, 1.12), mat("#a01830")); bed2.position.set(0, 0.5, -0.2); g.add(bed2); o.sheet = bed2;
      o.curt = [];
      for (const sx of [-1, 1]) { const c = new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.5, 0.06), mat("#b0102a", { std: true, r: 0.7 })); c.position.set(sx * 0.47, 0.75, 0.9); g.add(c); o.curt.push(c); }
      const def = GIRL[s.girl];
      if (def) {
        const p = person("girl", { dress: def.dress, hair: def.hair, style: def.style }); p.root.position.set(-0.55, 0, 1.25); g.add(p.root); o.girl = p;
        const tg = label(def.n + " " + TYPES[def.t].ic, { fs: 30, size: 0.26, bg: "rgba(20,8,20,.75)" }); tg.position.set(0, 2.25, -0.85); g.add(tg);
      }
      o.need = label("🧺 бельё!", { fs: 32, size: 0.3, bg: "#2a6aa8" }); o.need.position.set(0, 1.6, -0.2); o.need.visible = false; g.add(o.need);
      o.champ = bottle(); o.champ.position.set(0.75, 0.9, 1.3); o.champ.visible = false; g.add(o.champ);
      o.coins = []; o.cashV = -1;
      o.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color: "#ff2a4a", blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 })); o.glow.scale.set(3, 3, 1); o.glow.position.set(0, 1.6, 1); g.add(o.glow);
      o.bar = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.12), new THREE.MeshBasicMaterial({ color: "#ffd34d" })); o.bar.position.set(0, 2.5, 1.0); o.bar.visible = false; g.add(o.bar);
    }
    if (k === "laundry") {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1, 0.8), mat("#e8eef2")); b.position.y = 0.5; b.castShadow = true; g.add(b);
      const d = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.05, 18), mat("#2a3a5a", { std: true, r: 0.2 })); d.rotation.x = Math.PI / 2; d.position.set(0, 0.55, 0.41); g.add(d); o.drum = d;
      o.stack = stackMeshes(g, "l", 6, 1.05);
      const lb = label("стирка 🧺", { fs: 26, size: 0.2, bg: "rgba(20,40,70,.8)" }); lb.position.y = 2.1; g.add(lb);
    }
    if (k === "bar") {
      const b = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1, 0.8), mat("#6a3a22")); b.position.y = 0.5; b.castShadow = true; g.add(b);
      const tp = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 0.9), mat("#2a140c")); tp.position.y = 1.02; g.add(tp);
      o.stack = stackMeshes(g, "b", 4, 1.2);
      const lb = label("бар 🍾", { fs: 26, size: 0.2, bg: "rgba(60,10,20,.85)" }); lb.position.y = 2.1; g.add(lb);
    }
    if (k === "shelf") {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.6, 0.6), mat("#7a4a2a")); b.position.y = 0.8; b.castShadow = true; g.add(b);
      o.stack = stackMeshes(g, "l", 6, 0.3, 0.33); o.autoLabel = label("шкаф 🧺 авто", { fs: 26, size: 0.2, bg: "rgba(20,40,70,.85)" }); o.autoLabel.position.y = 2.2; g.add(o.autoLabel);
    }
    if (k === "post") {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.9, 0.5), mat("#b8862a", { std: true, m: 0.8, r: 0.3 })); b.position.y = 0.45; g.add(b);
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.6, 10), mat("#d9a93a", { std: true, m: 0.9, r: 0.25 })); t.position.y = 2.1; g.add(t);
      const lb = label("почта 📮 авто", { fs: 26, size: 0.2, bg: "rgba(60,40,10,.85)" }); lb.position.y = 1.6; lb.position.z = 0.5; g.add(lb);
    }
    if (k === "lift") {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.6, 0.7), mat("#2a2a2a")); b.position.y = 0.8; g.add(b);
      const gl = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.3, 0.72), mat("#d9a93a", { std: true, m: 0.9, r: 0.3 })); gl.position.y = 1.65; g.add(gl);
      const lb = label("лифт 🍾 авто", { fs: 26, size: 0.2, bg: "rgba(60,10,20,.85)" }); lb.position.y = 2.2; g.add(lb);
    }
    if (k === "carpet") {
      const c = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), new THREE.MeshLambertMaterial({ map: rugT })); c.rotation.x = -Math.PI / 2; c.position.y = 0.015; g.add(c);
      const lb = label("дорожка 🟥 авто", { fs: 26, size: 0.2, bg: "rgba(60,10,20,.85)" }); lb.position.y = 0.8; g.add(lb);
    }
    if (k === "crate") {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.8, 0.9), mat("#9a6a3a")); b.position.y = 0.4; b.castShadow = true; g.add(b);
      const lb = label("📦 " + (ST[s.as] ? ST[s.as].n : "") + (s.as === "room" && GIRL[s.girl] ? ": " + GIRL[s.girl].n : ""), { fs: 26, size: 0.22, bg: "rgba(40,20,10,.85)" }); lb.position.y = 1.3; g.add(lb);
    }
    if (ST[k] && ST[k].R) { o.range = ring(ST[k].R, k === "post" ? "#ffd34d" : k === "lift" || k === "carpet" ? "#ff6a8a" : "#8fd8ff", { op: 0.25 }); o.range.position.y = 0.02; g.add(o.range); }
    scene.add(g);
    return o;
  }
  const linenG = new THREE.BoxGeometry(0.4, 0.13, 0.3);
  function item(k) { return k === "b" ? bottle() : new THREE.Mesh(linenG, mat("#f6f2ea")); }
  function stackMeshes(g, k, n, y0, dy) { const arr = []; for (let i = 0; i < n; i++) { const m = item(k); if (dy) m.position.set(0, y0 + i * dy * 0.45, 0.32); else m.position.set(-0.3 + (i % 3) * 0.3, y0 + Math.floor(i / 3) * (k === "b" ? 0.34 : 0.15), 0.05); m.visible = false; g.add(m); arr.push(m); } return arr; }

  function playerMesh(p) {
    const P = person("man", { coat: ["#3a2a4a", "#2a3a4a", "#2a4a34", "#4a3a1a"][p.c], hat: "#1a1420", pants: "#1c1824", scarf: PCOL[p.c], skin: "#e8b896" });
    scene.add(P.root);
    const tag = label(p.name, { fs: 30, size: 0.28, bg: PCOL[p.c] }); tag.position.y = 2.2; P.root.add(tag);
    const glow = new THREE.Mesh(new THREE.CircleGeometry(1.2, 24), new THREE.MeshBasicMaterial({ map: GLOW, color: PCOL[p.c], blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.4 }));
    glow.rotation.x = -Math.PI / 2; scene.add(glow);
    return { P, tag, glow, hands: [], handsKey: "", x: p.x, z: p.z, yaw: p.yaw, mv: 0 };
  }
  function clientMesh(c) {
    const d = CLIENTS[c.type];
    const p = person("man", { coat: d.coat, hat: d.hat, hatType: c.type === "sailor" ? "sailor" : c.type === "rich" || c.type === "vip" ? "top" : "cap", pants: "#222", skin: ["#f1c7a5", "#e3b08a", "#c98b62", "#a8714c"][c.id % 4] });
    p.root.scale.setScalar(0.92); scene.add(p.root);
    const bub = label(d.ic + (c.type === "vip" ? "🍾" : ""), { fs: 44, size: 0.3, bg: c.type === "vip" ? "#5a1f2a" : "rgba(255,255,255,.92)", col: "#111", stroke: TYPES[d.likes].col }); bub.position.y = 2.15; p.root.add(bub);
    return { p, bub, x: c.x, z: c.z, yaw: c.yaw, mood: 0 };
  }
  function floatText(t, x, z, col) { const s = label(t, { fs: 44, size: 0.4, bg: false, col }); s.position.set(x, 2.6, z); scene.add(s); fx.push({ m: s, vy: 1.2, t: 1.2, txt: true }); }
  function poof(x, z) { for (let i = 0; i < 14; i++) { const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.08), new THREE.MeshBasicMaterial({ color: ["#ff6a8a", "#ffd34d", "#fff"][i % 3] })); m.position.set(x, 1, z); scene.add(m); fx.push({ m, vx: (R() - 0.5) * 5, vy: 2 + R() * 4, vz: (R() - 0.5) * 5, t: 0.9 }); } }
  function flyItem(k, from, to) { const m = k === "c" ? coinMesh() : item(k); m.position.set(from.x, 1.2, from.z); scene.add(m); fx.push({ m, fly: { x: to.x, z: to.z }, t: 0.6, arc: true, sx: from.x, sz: from.z, T: 0.6 }); }

  // призрак расстановки
  const ghost = new THREE.Mesh(new THREE.CircleGeometry(1, 28), new THREE.MeshBasicMaterial({ color: "#7ed957", transparent: true, opacity: 0.35, depthWrite: false })); ghost.rotation.x = -Math.PI / 2; ghost.visible = false; scene.add(ghost);
  const ghostR = ring(1, "#fff", { op: 0.3 }); ghostR.visible = false; scene.add(ghostR);
  const hiRing = ring(1.1, "#ffd34d", { op: 0.9 }); hiRing.visible = false; scene.add(hiRing);

  let lastEv = 0;
  const handlers = {};
  /* ---------- кадр ---------- */
  function draw(V, me, dt) {
    const meP = V.P[me];
    // мебель
    const seen = new Set();
    for (const s of V.S) {
      seen.add(s.id);
      let o = SM[s.id];
      const key = s.k + "|" + (s.girl || "") + "|" + (s.as || "");
      if (o && o.key !== key) { scene.remove(o.g); o = null; }
      if (!o) { o = SM[s.id] = stationMesh(s); o.key = key; o.g.position.set(s.x, 0, s.z); }
      const holder = s.carried && Object.values(V.P).find((p) => p.holding === s.id);
      if (holder) { const pm = PM[holder.id]; const hx = pm ? pm.x : holder.x, hz = pm ? pm.z : holder.z, hy = pm ? pm.yaw : holder.yaw; o.g.position.set(hx + Math.sin(hy) * 0.9, 1.0, hz + Math.cos(hy) * 0.9); o.g.scale.setScalar(0.55); }
      else { o.g.position.x = lerp(o.g.position.x, s.x, 1 - Math.exp(-dt * 14)); o.g.position.z = lerp(o.g.position.z, s.z, 1 - Math.exp(-dt * 14)); o.g.position.y = 0; o.g.scale.setScalar(1); }
      if (o.stack) o.stack.forEach((m, i) => (m.visible = i < s.stock));
      if (o.drum) o.drum.rotation.y += dt * (s.stock < 6 ? 6 : 0);
      if (s.k === "room") {
        const busy = s.st === "room", dirty = s.st === "dirty";
        o.need.visible = dirty && !s.carried; o.champ.visible = s.bottle;
        o.sheet.material = dirty ? mat("#8a7a6a") : mat("#a01830");
        o.curt.forEach((c, i) => { c.scale.x = lerp(c.scale.x, busy ? 1 : 0.25, 1 - Math.exp(-dt * 8)); c.position.x = (i ? 1 : -1) * lerp(c.position.x * (i ? 1 : -1), busy ? 0.47 : 0.82, 1 - Math.exp(-dt * 8)); });
        if (o.girl) { o.girl.root.visible = !busy && s.st !== "wait"; if (o.girl.root.visible) animPerson(o.girl, dt, 0, dirty ? "idle" : "lean"); }
        o.glow.material.opacity = lerp(o.glow.material.opacity, busy ? 0.7 : 0, 1 - Math.exp(-dt * 6));
        o.bar.visible = busy; if (busy) { o.bar.scale.x = Math.max(0.01, s.prog); o.bar.position.x = -0.7 + 0.7 * s.prog; }
        const n = Math.min(12, Math.ceil(s.cash / 10));
        if (n !== o.cashV) { o.cashV = n; o.coins.forEach((m) => o.g.remove(m)); o.coins = []; for (let k = 0; k < n; k++) { const m = coinMesh(); m.position.set(0.75 + ((k % 3) - 1) * 0.12, 0.05 + Math.floor(k / 3) * 0.065, 1.35); o.g.add(m); o.coins.push(m); } }
      }
      if (o.range) {
        const near = meP && (meP.holding === s.id || Math.hypot(meP.x - s.x, meP.z - s.z) < ST[s.k].R + 1);
        o.range.children[0].material.opacity = near ? 0.8 : 0.22; o.range.children[1].material.opacity = near ? 0.12 : 0.04;
      }
    }
    for (const id in SM) if (!seen.has(+id)) { scene.remove(SM[id].g); delete SM[id]; }

    // игроки
    const pseen = new Set();
    for (const p of Object.values(V.P)) {
      pseen.add(p.id);
      let o = PM[p.id]; if (!o) o = PM[p.id] = playerMesh(p);
      const local = p.id === me;
      const k = local ? 1 : 1 - Math.exp(-dt * 12);
      const ox = o.x, oz = o.z;
      o.x = lerp(o.x, p.x, k); o.z = lerp(o.z, p.z, k); o.yaw = local ? p.yaw : angLerp(o.yaw, p.yaw, k);
      const sp = Math.hypot(o.x - ox, o.z - oz) / Math.max(dt, 0.001);
      o.mv = lerp(o.mv, sp, 0.3);
      o.P.root.position.set(o.x, 0, o.z); o.P.root.rotation.y = o.yaw;
      animPerson(o.P, dt, o.mv / 5, p.hands.length || p.holding ? "carry" : p.carryN ? "wave" : "idle");
      o.glow.position.set(o.x, 0.02, o.z);
      const hk = p.hands.join("");
      if (hk !== o.handsKey) { o.handsKey = hk; o.hands.forEach((m) => scene.remove(m)); o.hands = p.hands.map((h) => { const m = item(h); scene.add(m); return { k: h, m }; }); }
      let y = 1.15; for (const h of o.hands) { h.m.position.set(o.x + Math.sin(o.yaw) * 0.38, y, o.z + Math.cos(o.yaw) * 0.38); h.m.rotation.y = o.yaw; y += h.k === "b" ? 0.34 : 0.15; }
    }
    for (const id in PM) if (!pseen.has(id)) { scene.remove(PM[id].P.root); scene.remove(PM[id].glow); PM[id].hands.forEach((h) => scene.remove(h.m)); delete PM[id]; }

    // клиенты
    const cseen = new Set();
    for (const c of V.C) {
      cseen.add(c.id);
      let o = CM[c.id]; if (!o) o = CM[c.id] = clientMesh(c);
      const k = 1 - Math.exp(-dt * 10);
      o.x = lerp(o.x, c.x, k); o.z = lerp(o.z, c.z, k); o.yaw = angLerp(o.yaw, c.yaw, k);
      o.p.root.position.set(o.x, 0, o.z); o.p.root.rotation.y = c.st === "wait" ? -Math.PI * 0.6 : o.yaw;
      o.p.root.visible = c.st !== "inRoom";
      animPerson(o.p, dt, Math.min(1, c.mv / 3), "idle");
      if (c.mood !== o.mood) { o.mood = c.mood; o.p.root.remove(o.bub); o.bub = label(c.mood === 2 ? "😍" : c.mood === 1 ? "🙂" : "😤", { fs: 50, size: 0.38, bg: false }); o.bub.position.y = 2.2; o.p.root.add(o.bub); }
      if (c.st === "wait" && c.pat < 8) o.bub.material.opacity = 0.45 + 0.55 * Math.abs(Math.sin(performance.now() / 140)); else o.bub.material.opacity = 1;
    }
    for (const id in CM) if (!cseen.has(+id)) { scene.remove(CM[id].p.root); delete CM[id]; }

    // события
    for (const e of V.ev) {
      if (e.i <= lastEv) continue; lastEv = e.i;
      if (e.to && e.to !== me) continue;
      if (e.k === "pay") floatText((e.match ? "❤️ +" : "+") + e.v, e.x, e.z + 1, e.match ? "#ff8fc7" : "#7ed957");
      if (e.k === "cash") floatText("💰 +" + e.v, e.x + 0.7, e.z + 1.3, "#ffd34d");
      if (e.k === "clean") floatText("✨", e.x, e.z + 1, "#8fd8ff");
      if (e.k === "poof") poof(e.x, e.z);
      if (e.k === "auto") { const a = V.S.find((s) => s.id === e.a), b = V.S.find((s) => s.id === e.b); if (a && b) flyItem(e.it, front(a), front(b)); }
      (handlers[e.k] || []).forEach((f) => f(e));
      (handlers["*"] || []).forEach((f) => f(e));
    }

    // подсказки расстановки
    ghost.visible = ghostR.visible = hiRing.visible = false;
    if (meP && meP.holding) {
      const s = V.S.find((x) => x.id === meP.holding);
      if (s) { const sp = placeSpot(V, meP); const ok = canPlace(V, s.k, sp.x, sp.z, s.id); const r = ST[s.k].r + 0.2; ghost.visible = true; ghost.scale.setScalar(r); ghost.position.set(sp.x, 0.03, sp.z); ghost.material.color.set(ok ? "#7ed957" : "#ff4a4a"); const RR = ST[s.k === "crate" ? s.as : s.k] && ST[s.k === "crate" ? s.as : s.k].R; if (RR) { ghostR.visible = true; ghostR.scale.setScalar(RR); ghostR.position.set(sp.x, 0.03, sp.z); } }
    } else if (meP) { const g = grabbable(V, meP); if (g) { hiRing.visible = true; hiRing.scale.setScalar(ST[g.k].r + 0.3); hiRing.position.set(g.x, 0.04, g.z); } }

    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i]; f.t -= dt;
      if (f.fly) { const k = 1 - f.t / f.T; f.m.position.set(lerp(f.sx, f.fly.x, k), 1.2 + Math.sin(k * Math.PI) * 1.5, lerp(f.sz, f.fly.z, k)); }
      else { if (!f.txt) f.vy -= 9 * dt; f.m.position.x += (f.vx || 0) * dt; f.m.position.y += f.vy * dt; f.m.position.z += (f.vz || 0) * dt; if (f.txt) f.m.material.opacity = Math.min(1, f.t * 2); }
      if (f.t <= 0) { scene.remove(f.m); fx.splice(i, 1); }
    }
    neon.material.opacity = Math.random() < 0.015 ? 0.3 : 1;

    // камера: следим за своим, но держим зал в кадре
    if (meP) {
      const o = PM[me]; const asp = window.innerWidth / window.innerHeight, portrait = asp < 1;
      const fov = portrait ? 50 : 42; if (cam.fov !== fov) { cam.fov = fov; cam.updateProjectionMatrix(); }
      const cx = clamp(o.x * 0.4, portrait ? -1.3 : -0.5, portrait ? 1.3 : 0.5), cz = clamp(o.z * 0.45, -1.2, 2.2);
      const H = portrait ? 24 : 16, BZ = portrait ? 9.5 : 8.5;
      cam.position.x = lerp(cam.position.x, cx, 1 - Math.exp(-dt * 4)); cam.position.y = H; cam.position.z = lerp(cam.position.z, cz + BZ, 1 - Math.exp(-dt * 4));
      cam.lookAt(cam.position.x, 0, cam.position.z - BZ);
    }
    renderer.render(scene, cam);
  }
  cam.position.set(0, 19, 9);
  return { draw, resize: () => resize(cam), on: (k, f) => (handlers[k] ||= []).push(f), cam, scene };
}
