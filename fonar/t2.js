// ЭТАП 2 «Квартал» — ты больше не ходишь. Ты менеджер зазывал: смотришь сверху на 4 переулка,
// перетаскиваешь девушек туда, где их клиенты, гасишь фонари перед патрулём. Ночь идёт в реальном времени,
// утром — отчёт и найм. Механика: распределение под волны спроса.
import { THREE, renderer, resize, mat, person, animPerson, label, ring, cobbleTex, brickTex, canvasTex, clamp, lerp, angLerp, rnd } from "./c3d.js";
const ROOF = canvasTex(256, 128, (g, w, h) => { g.fillStyle = "#8a3a26"; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 16) for (let x = (y / 16) % 2 ? -12 : 0; x < w; x += 24) { g.fillStyle = `hsl(${12 + Math.random() * 8},${45 + Math.random() * 10}%,${30 + Math.random() * 10}%)`; g.beginPath(); g.roundRect(x + 1, y + 1, 22, 14, [0, 0, 8, 8]); g.fill(); } });
import { GIRL, CLIENTS, TYPES, T2_ALLEYS, T2_HOSTS, T2_NIGHTS } from "./data.js";

const NIGHT_LEN = 100; // секунд реального времени
const AL = {
  fonar: { x: 0, z: -7.2, ry: 0 },
  port: { x: -4.3, z: -1.2, ry: Math.PI / 2 },
  bulvar: { x: 4.3, z: -1.2, ry: -Math.PI / 2 },
  sad: { x: 0, z: 5.2, ry: Math.PI },
};
const ENTR = { sailor: { x: -10, z: -1.2 }, rich: { x: 10, z: -1.2 }, vip: { x: 10, z: 0.2 }, student: { x: 0, z: 12 } };
const PAY = { sailor: 14, student: 11, rich: 20, vip: 55 };
const FOUNT = { x: 0, z: -1.2, r: 1.5 };

export function createT2(app) {
  const S = app.state.t2;
  const R = rnd(21 + S.night * 7);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#0e0a18");
  scene.fog = new THREE.Fog("#140c22", 30, 60);
  const cam = new THREE.PerspectiveCamera(38, 1, 0.1, 150);
  scene.add(new THREE.HemisphereLight("#a89ae8", "#3a2440", 1.3));
  const moon = new THREE.DirectionalLight("#c0c8ff", 1.2); moon.position.set(-10, 25, 12); moon.castShadow = true;
  moon.shadow.mapSize.set(1024, 1024); Object.assign(moon.shadow.camera, { left: -14, right: 14, top: 16, bottom: -16, near: 1, far: 70 });
  scene.add(moon);

  // земля, площадь, фонтан, трамвайные пути
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(50, 50), new THREE.MeshStandardMaterial({ map: cobbleTex(), roughness: 0.4, metalness: 0.12 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  const plaza = new THREE.Mesh(new THREE.CircleGeometry(3.4, 40), mat("#3a3044")); plaza.rotation.x = -Math.PI / 2; plaza.position.set(FOUNT.x, 0.02, FOUNT.z); plaza.receiveShadow = true; scene.add(plaza);
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.5, 0.45, 20), mat("#6a6070")); bowl.position.set(FOUNT.x, 0.22, FOUNT.z); bowl.castShadow = true; scene.add(bowl);
  const water = new THREE.Mesh(new THREE.CircleGeometry(1.25, 24), new THREE.MeshStandardMaterial({ color: "#3a5aa8", roughness: 0.1, metalness: 0.3, emissive: "#10204a" })); water.rotation.x = -Math.PI / 2; water.position.set(FOUNT.x, 0.46, FOUNT.z); scene.add(water);
  const col = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.25, 1.4, 8), mat("#8a8090")); col.position.set(FOUNT.x, 0.9, FOUNT.z); scene.add(col);
  for (const z of [-1.6, -0.8]) { const r = new THREE.Mesh(new THREE.BoxGeometry(50, 0.04, 0.12), mat("#6a6470", { std: true, m: 0.8, r: 0.3 })); r.position.set(0, 0.03, z + 9.6); scene.add(r); }
  // въезды-указатели
  const entLabels = [["⚓ Порт", -8.6, -2.6], ["🎩 Проспект", 8.6, -2.6], ["🎓 Университет", 0, 10.8]];
  for (const [t, x, z] of entLabels) { const l = label(t, { fs: 36, size: 0.42, bg: "rgba(10,6,20,.75)", depth: true }); l.position.set(x, 0.8, z); scene.add(l); }
  // фонари вокруг площади
  for (const [x, z] of [[-2.6, -3.8], [2.6, -3.8], [-2.6, 1.4], [2.6, 1.4]]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 2.6, 6), mat("#1c1c22")); p.position.set(x, 1.3, z); scene.add(p);
    const h = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), new THREE.MeshBasicMaterial({ color: "#ffb35a" })); h.position.set(x, 2.7, z); scene.add(h);
    const l = new THREE.PointLight("#ffb35a", 6, 8, 1.6); l.position.set(x, 2.5, z); scene.add(l);
  }

  /* ---------- переулки ---------- */
  const brick = new THREE.MeshLambertMaterial({ map: brickTex("#5a2a30") });
  const alleys = {};
  for (const def of T2_ALLEYS) {
    const P = AL[def.id];
    const g = new THREE.Group(); g.position.set(P.x, 0, P.z); g.rotation.y = P.ry; scene.add(g);
    const b = new THREE.Mesh(new THREE.BoxGeometry(4, 3.2, 1.8), brick); b.position.set(0, 1.6, -0.6); b.castShadow = true; b.receiveShadow = true; g.add(b);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(4.3, 0.3, 2.1), new THREE.MeshLambertMaterial({ map: ROOF })); roof.position.set(0, 3.3, -0.6); g.add(roof);
    const ridge = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 4.3, 6), mat("#5a2418")); ridge.rotation.z = Math.PI / 2; ridge.position.set(0, 3.5, -0.6); g.add(ridge);
    for (const cx of [-1.4, 1.3]) { const ch = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.7, 0.35), mat("#4a2a22")); ch.position.set(cx, 3.7, -1.1); g.add(ch); }
    for (let i = 0; i < 3; i++) { const w = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.6), new THREE.MeshBasicMaterial({ color: i === 1 ? "#ff9a5a" : "#ffcf7a" })); w.position.set(-1.2 + i * 1.2, 2.55, 0.31); g.add(w); }
    const doors = [], lamps = [];
    for (let i = 0; i < 3; i++) {
      const d = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.6, 0.08), mat("#5a1f22")); d.position.set(-1.2 + i * 1.2, 0.8, 0.32); g.add(d); doors.push(d);
      const lm = new THREE.MeshBasicMaterial({ color: "#3a1010" });
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), lm); l.position.set(-1.2 + i * 1.2, 1.85, 0.4); g.add(l); lamps.push(lm);
    }
    const light = new THREE.PointLight("#ff3a5a", 0, 7, 1.5); light.position.set(0, 2.2, 1.6); g.add(light);
    const sign = label(def.n, { fs: 40, size: 0.5, bg: "#2a0a14", col: "#ffd34d", depth: false, stroke: "#ff6a8a" }); sign.position.set(0, 3.9, -0.2); g.add(sign);
    const sel = ring(2.5, "#ffd34d", { op: 0.7 }); sel.position.set(0, 0.04, 1.6); sel.scale.set(1, 1, 0.6); sel.visible = false; g.add(sel);
    const lock = label("🔒 " + def.n, { fs: 40, size: 0.5, bg: "rgba(0,0,0,.7)" }); lock.position.set(0, 1.8, 1.2); g.add(lock);
    const closedL = label("🌑 фонари погашены", { fs: 34, size: 0.4, bg: "rgba(10,10,30,.85)" }); closedL.position.set(0, 2.7, 1.4); closedL.visible = false; g.add(closedL);
    const qL = label("", { fs: 34, size: 0.36 }); qL.visible = false; g.add(qL);
    alleys[def.id] = { def, g, P, doors, lamps, light, sign, sel, lock, closedL, open: S.alleys.includes(def.id), closed: 0, queue: [], slots: [null, null, null], host: null, hostT: 0, earned: 0, police: null };
  }
  // мировые координаты точки в системе переулка
  function aw(a, lx, lz) { const c = Math.cos(a.P.ry), s = Math.sin(a.P.ry); return { x: a.P.x + lx * c + lz * s, z: a.P.z - lx * s + lz * c }; }
  function slotPos(a, i) { return aw(a, -1.2 + i * 1.2, 1.25); }
  function queuePos(a, i) { return aw(a, -1.6 + (i % 5) * 0.8, 2.8 + Math.floor(i / 5) * 0.7); }
  function hostPos(a) { return aw(a, 2.3, 1.6); }

  /* ---------- девушки и зазывалы ---------- */
  const girls = [];
  function addGirl(id, alleyId) {
    const def = GIRL[id];
    const p = person("girl", { dress: def.dress, hair: def.hair, style: def.style, skin: ["#f6d5bd", "#f1c7a5", "#e3b08a", "#c98b62"][girls.length % 4] });
    scene.add(p.root);
    const tag = label(TYPES[def.t].ic, { fs: 44, size: 0.38, bg: TYPES[def.t].col, col: "#111" }); tag.position.y = 2.15; p.root.add(tag);
    const g = { def, p, tag, alley: null, slot: -1, st: "idle", x: 0, z: 0, tx: 0, tz: 0, cl: null, t: 0 };
    girls.push(g);
    place(g, alleyId);
    g.x = g.tx; g.z = g.tz; p.root.position.set(g.x, 0, g.z);
    if (g.st === "walk") g.st = "idle";
    return g;
  }
  function place(g, alleyId) {
    const a = alleys[alleyId]; if (!a) return false;
    const i = a.slots.indexOf(null); if (i < 0) return false;
    if (g.alley) { const old = alleys[g.alley]; old.slots[g.slot] = null; }
    a.slots[i] = g; g.alley = alleyId; g.slot = i;
    const p = slotPos(a, i); g.tx = p.x; g.tz = p.z; g.st = "walk";
    S.place[g.def.id] = alleyId;
    return true;
  }
  function swap(g1, g2) {
    const a1 = alleys[g1.alley], a2 = alleys[g2.alley], s1 = g1.slot, s2 = g2.slot;
    a1.slots[s1] = g2; a2.slots[s2] = g1;
    g1.alley = a2.def.id; g1.slot = s2; g2.alley = a1.def.id; g2.slot = s1;
    for (const g of [g1, g2]) { const p = slotPos(alleys[g.alley], g.slot); g.tx = p.x; g.tz = p.z; g.st = "walk"; S.place[g.def.id] = g.alley; }
    app.sfx("ok"); app.toast(`${g1.def.n} ⇄ ${g2.def.n}`);
  }
  const hosts = {};
  function setHost(alleyId, hostId) {
    const a = alleys[alleyId]; const def = T2_HOSTS.find((h) => h.id === hostId);
    if (a.host) scene.remove(a.host.p.root);
    const p = person("man", { coat: ["#6a5a2a", "#3a4a3a", "#2a2a4a", "#5a3a2a", "#6a3a1a"][T2_HOSTS.indexOf(def)], hat: "#2a2018", pants: "#222", scarf: "#3aa0c8" });
    const pos = hostPos(a); p.root.position.set(pos.x, 0, pos.z); p.root.rotation.y = a.P.ry; scene.add(p.root);
    const tg = label(def.n, { fs: 30, size: 0.28 }); tg.position.y = 2.05; p.root.add(tg);
    a.host = { def, p, x: pos.x, z: pos.z, busy: 0 };
    hosts[alleyId] = hostId; S.hosts[alleyId] = hostId;
  }
  for (const id of S.girls) addGirl(id, S.place[id] && S.alleys.includes(S.place[id]) ? S.place[id] : S.alleys.find((al) => alleys[al].slots.includes(null)));
  for (const [al, h] of Object.entries(S.hosts)) if (S.alleys.includes(al)) setHost(al, h);
  function refreshAlleys() { for (const a of Object.values(alleys)) { a.open = S.alleys.includes(a.def.id); a.lock.visible = !a.open; a.sign.visible = a.open; } }
  refreshAlleys();

  /* ---------- ночь ---------- */
  const night = { t: 0, on: false, earned: 0, served: 0, lost: 0, perfect: 0, fines: 0, police: false, def: T2_NIGHTS[Math.min(S.night, T2_NIGHTS.length - 1)], spawnAcc: 0, vipDone: false };
  const clients = [];
  function rate(type, f) {
    let r = 0.12;
    for (const w of night.def.waves) if (w.who === type) r += w.k * 0.9 * Math.exp(-((f - w.at - 0.08) ** 2) / (2 * 0.07 ** 2));
    if (type === "vip") r = r * 0.4;
    return r * (S.ads ? 1.2 : 1);
  }
  function spawn(type) {
    const d = CLIENTS[type], E = ENTR[type];
    const p = person("man", { coat: d.coat, hat: d.hat, hatType: type === "sailor" ? "sailor" : type === "rich" || type === "vip" ? "top" : "cap", pants: "#222", skin: ["#f1c7a5", "#e3b08a", "#c98b62", "#a8714c"][Math.floor(R() * 4)] });
    p.root.scale.setScalar(0.9);
    const bub = label(d.ic, { fs: 40, size: 0.34, bg: "rgba(255,255,255,.9)", col: "#111", stroke: TYPES[d.likes].col }); bub.position.y = 2.1; p.root.add(bub);
    const c = { type, p, bub, x: E.x + (R() - 0.5), z: E.z + (R() - 0.5), st: "walk", alley: null, tx: 0, tz: 0, pat: 0, sp: 2.4 + R() * 0.6 };
    p.root.position.set(c.x, 0, c.z); scene.add(p.root);
    chooseAlley(c);
    clients.push(c);
  }
  function chooseAlley(c, exclude) {
    let best = null, bs = 0;
    for (const a of Object.values(alleys)) {
      if (!a.open || a.closed > 0 || a === exclude) continue;
      const cap = a.host ? 6 : 3;
      if (a.queue.length >= cap) continue;
      const d = Math.hypot(a.P.x - c.x, a.P.z - c.z);
      const like = CLIENTS[c.type].likes;
      const has = a.slots.some((g) => g && g.def.t === like);
      const charm = a.host ? a.host.def.charm : 0.7;
      const s = (1 / (3 + d)) * charm * (has ? 1.8 : 1) * (a.def.near === c.type ? 1.4 : 1) / (1 + a.queue.length * 0.25);
      if (s > bs) { bs = s; best = a; }
    }
    if (!best) { c.st = "leave"; night.lost++; mood(c, "😤"); return; }
    c.alley = best; best.queue.push(c); c.st = "walk"; c.pat = best.host ? 20 : 15;
  }
  function mood(c, e) { c.p.root.remove(c.bub); const h = label(e, { fs: 44, size: 0.36, bg: false }); h.position.y = 2.2; c.p.root.add(h); c.bub = h; }

  /* ---------- патруль ---------- */
  let cop = null;
  function spawnCop() {
    const targets = Object.values(alleys).filter((a) => a.open);
    const a = targets.sort((x, y) => y.queue.length - x.queue.length)[0];
    if (!a) return;
    const p = person("man", { coat: "#1a2a4a", hat: "#1a2a4a", hatType: "cap", pants: "#141a2a" });
    const lt = new THREE.PointLight("#bcd4ff", 3, 4, 1.5); lt.position.set(0.3, 1.2, 0.3); p.root.add(lt);
    p.root.position.set(0, 0, 12); scene.add(p.root);
    const tg = label("👮 патруль", { fs: 34, size: 0.34, bg: "#1a2a4a" }); tg.position.y = 2.2; p.root.add(tg);
    const warn = label("⚠️ ПАТРУЛЬ ИДЁТ СЮДА", { fs: 36, size: 0.42, bg: "#7a1010" }); a.g.add(warn); warn.position.set(0, 1.5, 3.6);
    cop = { p, a, x: 0, z: 12, st: "go", t: 0, warn };
    app.toast(`👮 Патруль идёт в ${a.def.n}! Погаси фонари (тап по переулку), если там очередь`);
    app.sfx("alarm");
  }
  function stepCop(dt) {
    const c = cop; const tgt = c.st === "go" ? aw(c.a, 0, 3.4) : { x: 0, z: 13 };
    const dx = tgt.x - c.x, dz = tgt.z - c.z, d = Math.hypot(dx, dz);
    if (d > 0.1) { const st = Math.min(d, 1.5 * dt); c.x += (dx / d) * st; c.z += (dz / d) * st; c.p.root.rotation.y = Math.atan2(dx, dz); }
    c.p.root.position.set(c.x, 0, c.z); animPerson(c.p, dt, d > 0.1 ? 0.6 : 0, "idle");
    if (c.st === "go" && d < 0.15) {
      c.st = "check"; c.t = 0; c.a.g.remove(c.warn);
      if (c.a.open && c.a.closed <= 0 && c.a.queue.length >= 2) {
        const fine = Math.round(night.earned * 0.25 + 60); night.fines += fine; app.addMoney(-fine, true);
        c.a.closed = 12; for (const k of c.a.queue.splice(0)) { k.alley = null; chooseAlley(k, c.a); }
        app.toast(`👮 Штраф −${fine}: в ${c.a.def.n} была толпа. Переулок закрыт на время`); app.sfx("bad"); app.haptic("heavy");
      } else { app.toast("👮 Патруль ничего не нашёл. Чисто!"); app.sfx("ok"); }
    }
    if (c.st === "check") { c.t += dt; if (c.t > 2.5) c.st = "back"; }
    if (c.st === "back" && d < 0.3) { scene.remove(c.p.root); cop = null; }
  }

  /* ---------- выбор и тапы ---------- */
  let selGirl = null, selRing = ring(0.5, "#ffd34d"); selRing.visible = false; scene.add(selRing);
  const ray = new THREE.Raycaster(), v2 = new THREE.Vector2();
  function groundAt(px, py) {
    v2.set((px / window.innerWidth) * 2 - 1, -(py / window.innerHeight) * 2 + 1);
    ray.setFromCamera(v2, cam);
    const t = -ray.ray.origin.y / ray.ray.direction.y;
    return { x: ray.ray.origin.x + ray.ray.direction.x * t, z: ray.ray.origin.z + ray.ray.direction.z * t };
  }
  function tap(px, py) {
    const w = groundAt(px, py);
    // девушка?
    let gBest = null, gd = 0.9;
    for (const g of girls) { if (g.st === "busy" || g.st === "taken") continue; const d = Math.hypot(g.x - w.x, g.z - w.z); if (d < gd) { gd = d; gBest = g; } }
    // переулок?
    let aBest = null, ad = 3.2;
    for (const a of Object.values(alleys)) { const c = aw(a, 0, 1.0); const d = Math.hypot(c.x - w.x, c.z - w.z); if (d < ad) { ad = d; aBest = a; } }
    if (selGirl && aBest && aBest.def.id !== selGirl.alley) {
      if (!aBest.open) { app.toast("Переулок ещё закрыт — откроешь утром в найме"); return; }
      if (place(selGirl, aBest.def.id)) { app.sfx("ok"); app.toast(`${selGirl.def.n} → ${aBest.def.n}`); S.moves = (S.moves || 0) + 1; }
      else {
        // мест нет: меняем местами с той, по которой тапнули (или с первой свободной от работы)
        const other = (gBest && gBest.alley === aBest.def.id && gBest.st !== "busy" && gBest.st !== "taken") ? gBest : aBest.slots.find((g) => g && (g.st === "idle" || g.st === "walk"));
        if (other) swap(selGirl, other); else app.toast(`В ${aBest.def.n} все заняты — подожди`);
      }
      selGirl = null; app.t2sel(null); return;
    }
    if (gBest && gBest !== selGirl) { selGirl = gBest; app.sfx("pick"); app.haptic("light"); app.t2sel(gBest); return; }
    if (aBest && aBest.open && !selGirl) {
      if (!night.on) { app.toast("Фонари можно гасить ночью"); return; }
      aBest.closed = aBest.closed > 0 ? 0 : 10;
      if (aBest.closed > 0) { for (const k of aBest.queue.splice(0)) { k.alley = null; chooseAlley(k, aBest); } app.toast(`🌑 ${aBest.def.n}: фонари погашены на 10 с, очередь разошлась`); }
      else app.toast(`💡 ${aBest.def.n}: снова открыт`);
      app.sfx("pick"); return;
    }
    selGirl = null; app.t2sel(null);
  }

  /* ---------- шаг ---------- */
  function update(dt) {
    if (night.on) {
      night.t += dt;
      const f = night.t / NIGHT_LEN;
      for (const type of ["sailor", "student", "rich", "vip"]) {
        night["acc_" + type] = (night["acc_" + type] || 0) + rate(type, f) * dt;
        while (night["acc_" + type] >= 1) { night["acc_" + type] -= 1; spawn(type); }
      }
      if (!night.police && f > 0.3 + (S.night % 3) * 0.12) { night.police = true; spawnCop(); }
      if (f >= 1) endNight();
    }
    if (cop) stepCop(dt);
    for (const a of Object.values(alleys)) stepAlley(a, dt);
    for (const g of girls) stepGirl(g, dt);
    for (let i = clients.length - 1; i >= 0; i--) { const c = clients[i]; stepClient(c, dt); if (c.st === "gone") { scene.remove(c.p.root); clients.splice(i, 1); } }
    if (selGirl) { selRing.visible = true; selRing.position.set(selGirl.x, 0.05, selGirl.z); } else selRing.visible = false;
    for (let i = fx.length - 1; i >= 0; i--) { const f = fx[i]; f.t -= dt; f.m.position.y += dt * 1.3; f.m.material.opacity = Math.min(1, f.t * 2); if (f.t <= 0) { scene.remove(f.m); fx.splice(i, 1); } }
    fitCam();
    const f = night.on ? night.t / NIGHT_LEN : 0;
    app.t2hud({ on: night.on, f, earned: night.earned, goal: night.def.goal, def: night.def, lost: night.lost, served: night.served, perfect: night.perfect });
  }
  const fx = [];
  function floatText(txt, x, z, col) { const s = label(txt, { fs: 40, size: 0.38, bg: false, col }); s.position.set(x, 2.6, z); scene.add(s); fx.push({ m: s, t: 1.1 }); }

  function stepAlley(a, dt) {
    if (a.closed > 0) a.closed -= dt;
    a.closedL.visible = a.closed > 0;
    const busy = a.slots.filter((g) => g && g.st === "busy").length;
    a.light.intensity = a.open && a.closed <= 0 ? 1 + busy * 1.6 : 0;
    a.lamps.forEach((m, i) => m.color.set(a.slots[i] && a.slots[i].st === "busy" ? "#ff2a3a" : a.slots[i] ? "#6a1a1a" : "#2a1010"));
    // зазывала ведёт первого из очереди к свободной девушке; без зазывалы — медленнее
    a.hostT -= dt;
    if (a.hostT <= 0 && a.queue.length) {
      const c = a.queue.find((k) => k.st === "queue");
      if (c) {
        const like = CLIENTS[c.type].likes;
        const free = a.slots.filter((g) => g && g.st === "idle");
        let g = free.find((g) => g.def.t === like) || (c.type === "vip" ? null : free[0]);
        if (g) {
          a.queue.splice(a.queue.indexOf(c), 1);
          g.st = "taken"; g.cl = c; c.st = "toGirl"; c.girl = g;
          a.hostT = a.host ? 1.1 / a.host.def.speed : 2.6;
          if (a.host) { a.host.busy = 0.6; }
        }
      }
    }
    if (a.host) { animPerson(a.host.p, dt, 0, a.host.busy > 0 ? "wave" : "idle"); a.host.busy -= dt; }
    // позиции очереди
    let i = 0; for (const c of a.queue) { const p = queuePos(a, i++); c.tx = p.x; c.tz = p.z; }
  }
  function stepGirl(g, dt) {
    const p = g.p;
    if (g.st === "walk") {
      const dx = g.tx - g.x, dz = g.tz - g.z, d = Math.hypot(dx, dz);
      if (d > 0.08) { const st = Math.min(d, 2.6 * dt); g.x += (dx / d) * st; g.z += (dz / d) * st; avoid(g); p.root.rotation.y = angLerp(p.root.rotation.y, Math.atan2(dx, dz), dt * 10); animPerson(p, dt, 0.7, "idle"); }
      else { g.st = "idle"; }
      p.root.position.set(g.x, 0, g.z); return;
    }
    const a = alleys[g.alley];
    if (g.st === "idle") { p.root.rotation.y = angLerp(p.root.rotation.y, a.P.ry, dt * 4); animPerson(p, dt, 0, "lean"); return; }
    if (g.st === "taken") { animPerson(p, dt, 0, "wave"); if (g.cl.st === "atGirl") { g.st = "busy"; g.t = 0; p.root.visible = false; g.cl.p.root.visible = false; const match = CLIENTS[g.cl.type].likes === g.def.t; g.dur = (match ? 3.6 : 5.2) * (S.rooms ? 0.75 : 1); g.match = match; } return; }
    if (g.st === "busy") {
      g.t += dt;
      if (g.t >= g.dur) {
        p.root.visible = true; g.st = "idle";
        const c = g.cl; c.p.root.visible = true;
        const cut = a.host ? a.host.def.cut : 0;
        const val = Math.round(PAY[c.type] * (g.match ? 1.6 : 1) * (1 - cut));
        night.earned += val; night.served++; if (g.match) { night.perfect++; S.perfect = (S.perfect || 0) + 1; if (S.perfect === 20) app.unlockScene("SC18-T2-MATCH", "20 идеальных пар — сцена в альбоме"); }
        app.addMoney(val); floatText((g.match ? "❤️+" : "+") + val, g.x, g.z, g.match ? "#ff8fc7" : "#7ed957");
        if (c.type === "vip" && !night.vipDone) { night.vipDone = true; app.unlockScene("SC18-T2-VIP", "Особый гость доволен — сцена в альбоме"); }
        c.st = "leave"; mood(c, g.match ? "😍" : "🙂"); g.cl = null;
      }
    }
  }
  function stepClient(c, dt) {
    let tx = c.tx, tz = c.tz;
    if (c.st === "walk" && c.alley) { const i = c.alley.queue.indexOf(c); const p = queuePos(c.alley, i); tx = p.x; tz = p.z; }
    if (c.st === "toGirl") { tx = c.girl.x; tz = c.girl.z + 0.01; const s = slotPos(alleys[c.girl.alley], c.girl.slot); tx = s.x; tz = s.z; }
    if (c.st === "leave") { const E = ENTR[c.type]; tx = E.x; tz = E.z; }
    if (c.st === "atGirl" || c.st === "inRoom") return;
    if (c.st === "queue" && c.alley) {
      c.pat -= dt;
      if (c.pat < 5) c.bub.material.opacity = 0.4 + 0.6 * Math.abs(Math.sin(performance.now() / 140));
      if (c.pat <= 0) { c.alley.queue.splice(c.alley.queue.indexOf(c), 1); c.st = "leave"; night.lost++; mood(c, "😤"); }
    }
    const dx = tx - c.x, dz = tz - c.z, d = Math.hypot(dx, dz);
    if (d > 0.06) { const st = Math.min(d, c.sp * dt); c.x += (dx / d) * st; c.z += (dz / d) * st; avoid(c); c.p.root.rotation.y = angLerp(c.p.root.rotation.y, Math.atan2(dx, dz), dt * 10); animPerson(c.p, dt, 0.7, "idle"); }
    else animPerson(c.p, dt, 0, "idle");
    c.p.root.position.set(c.x, 0, c.z);
    if (c.st === "walk" && d < 0.1) c.st = "queue";
    if (c.st === "toGirl" && d < 0.15) c.st = "atGirl";
    if (c.st === "leave" && d < 0.4) c.st = "gone";
  }
  function avoid(o) { const dx = o.x - FOUNT.x, dz = o.z - FOUNT.z, d = Math.hypot(dx, dz); if (d < FOUNT.r + 0.3 && d > 0.001) { o.x = FOUNT.x + (dx / d) * (FOUNT.r + 0.3); o.z = FOUNT.z + (dz / d) * (FOUNT.r + 0.3); } }

  function startNight() {
    night.on = true; night.t = 0; night.earned = 0; night.served = 0; night.lost = 0; night.perfect = 0; night.fines = 0; night.police = false; night.vipDone = false;
    for (const k of Object.keys(night)) if (k.startsWith("acc_")) night[k] = 0;
    night.def = T2_NIGHTS[Math.min(S.night, T2_NIGHTS.length - 1)];
    app.sfx("buy");
  }
  function endNight() {
    night.on = false;
    for (const c of clients) { if (c.st !== "atGirl" && c.st !== "leave") { c.st = "leave"; if (c.alley) c.alley.queue = c.alley.queue.filter((k) => k !== c); } }
    for (const g of girls) if (g.st === "taken" && g.cl && g.cl.st === "leave") { g.st = "idle"; g.cl = null; }
    const ok = night.earned >= night.def.goal;
    const rep = { ...night, ok, def: night.def, idx: S.night };
    if (ok) { if (S.night === 3 && night.lost === 0) app.unlockScene("SC18-T2-DUO", "Идеальный карнавал — сцена в альбоме"); S.night++; }
    app.save();
    app.t2report(rep);
  }

  /* ---------- камера: всё поле в кадре на любом экране ---------- */
  function fitCam() {
    const asp = window.innerWidth / window.innerHeight;
    const W = 13.5, H = 19.5, vf = (cam.fov * Math.PI) / 360;
    const dist = Math.max(H / 2 / Math.tan(vf), W / 2 / (Math.tan(vf) * asp)) * 0.92;
    const tilt = 0.42;
    cam.position.set(0, Math.cos(tilt) * dist, -0.2 + Math.sin(tilt) * dist);
    cam.lookAt(0, 0, 0.2);
  }
  fitCam();

  return {
    scene, cam, update, tap,
    render() { renderer.render(scene, cam); },
    resize() { resize(cam); },
    startNight, get nightOn() { return night.on; }, nightDef: () => T2_NIGHTS[Math.min(S.night, T2_NIGHTS.length - 1)],
    hire(id, alleyId) { if (!S.girls.includes(id)) { S.girls.push(id); const al = alleyId || S.alleys.find((x) => alleys[x].slots.includes(null)); if (al) addGirl(id, al); else app.toast("Все места заняты — открой новый переулок"); } },
    openAlley(id) { if (!S.alleys.includes(id)) S.alleys.push(id); refreshAlleys(); },
    setHost, alleys, girls,
    freeSlots: () => Object.values(alleys).filter((a) => a.open).reduce((s, a) => s + a.slots.filter((x) => !x).length, 0),
    dispose() { },
  };
}
