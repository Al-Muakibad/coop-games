// ЭТАП 1 «Переулок» — аркадный айдл. Ты — зазывала: ведёшь клиентов из очереди к девушкам у стены,
// собираешь деньги, покупаешь улучшения на площадках. Механика: ходьба джойстиком и «караван» за спиной.
import { THREE, renderer, resize, mat, person, animPerson, label, ring, coinMesh, bottle, cobbleTex, brickTex, canvasTex, clamp, lerp, angLerp, rnd } from "./c3d.js";
import { GIRL, CLIENTS, TYPES, T1_PADS } from "./data.js";
import { GLOW } from "./c3d.js";

const SPOTS = [-3.3, -1.1, 1.1, 3.3]; // x мест у стены
const WALL_Z = -5, SPOT_Z = -3.9, CASH_DZ = 1.45;
const QUEUE = { x: 2.6, z: 6.2 }, BAR = { x: -3.4, z: 6.0 };
const BOUNDS = { x0: -4.6, x1: 5.4, z0: -3.2, z1: 8.2 };
const PAD_POS = { girl: null, bar: { x: -3.4, z: 6.0 }, helper: { x: 3.9, z: 3.0 }, promo: { x: 1.4, z: 2.6 } };
const DEF_PAD = { x: -1.5, z: 2.6 };
const BASE_PAY = { sailor: 12, student: 10, rich: 18, vip: 45 };

export function createT1(app) {
  const S = app.state.t1;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#120c1c");
  scene.fog = new THREE.FogExp2("#1a1028", 0.018);
  const cam = new THREE.PerspectiveCamera(42, 1, 0.1, 120);
  const R = rnd(11);
  const fx = [];

  /* ---------- свет ---------- */
  scene.add(new THREE.HemisphereLight("#9a8ae8", "#3a2440", 1.15));
  const moon = new THREE.DirectionalLight("#b8c4ff", 1.1);
  moon.position.set(-8, 16, 10); moon.castShadow = true;
  moon.shadow.mapSize.set(1024, 1024);
  Object.assign(moon.shadow.camera, { left: -14, right: 14, top: 12, bottom: -12, near: 1, far: 50 });
  scene.add(moon, moon.target);

  /* ---------- мир ---------- */
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 30), new THREE.MeshStandardMaterial({ map: cobbleTex(), roughness: 0.38, metalness: 0.15 }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(0, 0, 2); ground.receiveShadow = true; scene.add(ground);
  const walk = new THREE.Mesh(new THREE.PlaneGeometry(22, 1.6), mat("#3a3240")); walk.rotation.x = -Math.PI / 2; walk.position.set(0, 0.02, -4.3); walk.receiveShadow = true; scene.add(walk);

  // улица внизу: бордюр, мостовая темнее, трамвайные рельсы — откуда приходят клиенты
  const curb = new THREE.Mesh(new THREE.BoxGeometry(40, 0.18, 0.35), mat("#5a5260")); curb.position.set(0, 0.09, 9.0); scene.add(curb);
  const road = new THREE.Mesh(new THREE.PlaneGeometry(40, 8), mat("#1a1622")); road.rotation.x = -Math.PI / 2; road.position.set(0, 0.015, 13.1); road.receiveShadow = true; scene.add(road);
  for (const z of [10.6, 11.6, 13.4, 14.4]) { const r = new THREE.Mesh(new THREE.BoxGeometry(40, 0.05, 0.1), mat("#8a8494", { std: true, m: 0.9, r: 0.25 })); r.position.set(0, 0.04, z); scene.add(r); }
  const brick = new THREE.MeshLambertMaterial({ map: brickTex() });
  const wall = new THREE.Mesh(new THREE.BoxGeometry(22, 9, 1), brick); wall.position.set(0, 4.5, WALL_Z - 0.5); wall.receiveShadow = true; scene.add(wall);
  const cornice = new THREE.Mesh(new THREE.BoxGeometry(22.4, 0.35, 1.4), mat("#2a1a20")); cornice.position.set(0, 3.4, WALL_Z - 0.3); scene.add(cornice);
  // окна второго этажа с занавесками
  const winTex = canvasTex(64, 96, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, "#ffcf7a"); gr.addColorStop(1, "#ff7a4a"); g.fillStyle = gr; g.fillRect(0, 0, w, h); g.fillStyle = "#8a1a2a"; g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(w * 0.5, h * 0.3, 8, h); g.lineTo(0, h); g.fill(); g.beginPath(); g.moveTo(w, 0); g.quadraticCurveTo(w * 0.5, h * 0.3, w - 8, h); g.lineTo(w, h); g.fill(); g.fillStyle = "rgba(40,20,30,.6)"; g.fillRect(w / 2 - 2, 0, 4, h); });
  for (let i = -4; i <= 4; i++) {
    const x = i * 2.2; const lit = R() > 0.3;
    const wm = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.3), lit ? new THREE.MeshBasicMaterial({ map: winTex }) : mat("#1a1420"));
    wm.position.set(x, 5.2, WALL_Z + 0.02); scene.add(wm);
    const sill = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.1, 0.25), mat("#3a2228")); sill.position.set(x, 4.55, WALL_Z + 0.1); scene.add(sill);
  }
  // двери и лампы
  const doors = SPOTS.map((x, i) => {
    const fr = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2.5, 0.25), mat("#2a1418")); fr.position.set(x, 1.25, WALL_Z + 0.05); scene.add(fr);
    const d = new THREE.Mesh(new THREE.BoxGeometry(1.15, 2.2, 0.1), mat("#5a1f22")); d.position.set(x, 1.1, WALL_Z + 0.16); scene.add(d);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), mat("#d9a93a")); knob.position.set(x + 0.4, 1.1, WALL_Z + 0.24); scene.add(knob);
    const lampM = new THREE.MeshBasicMaterial({ color: "#3a1010" });
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), lampM); lamp.position.set(x, 2.75, WALL_Z + 0.3); scene.add(lamp);
    const pl = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color: "#ff2a4a", blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 }));
    pl.scale.set(3.2, 3.2, 1); pl.position.set(x, 2.5, WALL_Z + 0.5); scene.add(pl);
    const pool = new THREE.Mesh(new THREE.CircleGeometry(1.3, 24), new THREE.MeshBasicMaterial({ map: GLOW, color: "#ff2a4a", blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 }));
    pool.rotation.x = -Math.PI / 2; pool.position.set(x, 0.03, WALL_Z + 1.1); scene.add(pool);
    const num = label(String(i + 1), { fs: 40, size: 0.34, bg: "rgba(0,0,0,0)", col: "#d9a93a", depth: true }); num.position.set(x, 2.45, WALL_Z + 0.22); scene.add(num);
    return { x, d, lamp, lampM, pl, pool, open: 0 };
  });
  // газовые фонари
  const lampPosts = [];
  function lampPost(x, z, col = "#ffb35a", int = 9) {
    const g = new THREE.Group();
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 3.2, 6), mat("#1c1c22")); p.position.y = 1.6; p.castShadow = true; g.add(p);
    const h = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.12, 0.4, 6), new THREE.MeshBasicMaterial({ color: col })); h.position.y = 3.3; g.add(h);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.2, 6), mat("#1c1c22")); cap.position.y = 3.6; g.add(cap);
    const l = new THREE.PointLight(col, int, 11, 1.5); l.position.y = 3.1; g.add(l);
    g.position.set(x, 0, z); scene.add(g); lampPosts.push({ g, l, base: int });
    return g;
  }
  lampPost(-4.6, -3.1); lampPost(4.6, -3.1); lampPost(5.3, 6.9);
  let extraLamp = null;
  // скамья очереди
  const bench = new THREE.Group();
  const seat = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.12, 0.6), mat("#5a3a22")); seat.position.y = 0.5; bench.add(seat);
  const back = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.6, 0.1), mat("#5a3a22")); back.position.set(0, 0.85, 0.28); bench.add(back);
  for (const sx of [-1.1, 1.1]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 0.5), mat("#1c1c22")); l.position.set(sx, 0.25, 0); bench.add(l); }
  bench.position.set(QUEUE.x + 1.9, 0, QUEUE.z + 2.0); bench.rotation.y = Math.PI * 0.85; scene.add(bench);
  // афишная тумба
  const tumba = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 2.6, 12), new THREE.MeshLambertMaterial({ map: canvasTex(256, 256, (g, w, h) => { g.fillStyle = "#e8d8b0"; g.fillRect(0, 0, w, h); g.fillStyle = "#8a1a2a"; g.font = "900 34px Rubik, sans-serif"; g.fillText("КАБАРЕ", 20, 60); g.fillStyle = "#222"; g.font = "800 22px Nunito, sans-serif"; g.fillText("каждую ночь", 30, 100); g.fillStyle = "#1f5a7a"; g.fillRect(10, 130, w - 20, 100); g.fillStyle = "#ffd34d"; g.font = "900 30px Rubik"; g.fillText("ЦИРК!", 60, 195); }) }));
  tumba.position.set(5.9, 1.3, 2.0); tumba.castShadow = true; scene.add(tumba);
  // бар
  const barG = new THREE.Group(); barG.position.set(BAR.x - 1.35, 0, BAR.z); barG.rotation.y = Math.PI / 2; scene.add(barG);
  const counter = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.1, 0.9), mat("#6a3a22")); counter.position.y = 0.55; counter.castShadow = true; barG.add(counter);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.15, 1.6), mat("#8a1a2a")); roof.position.set(0, 2.5, -0.2); barG.add(roof);
  for (const sx of [-1.2, 1.2]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.5, 0.12), mat("#3a2218")); p.position.set(sx, 1.25, 0.3); barG.add(p); }
  const barSign = label("БАР 🍾", { fs: 40, size: 0.32, bg: "#2a0a12", col: "#ffd34d", depth: true }); barSign.position.set(0, 2.85, 0.4); barG.add(barSign);
  const barLight = new THREE.PointLight("#ffd08a", 0, 6, 1.6); barLight.position.set(0, 2.2, 0.8); barG.add(barLight);
  const barBottles = [];
  for (let i = 0; i < 4; i++) { const b = bottle(); b.position.set(-0.75 + i * 0.5, 1.27, 0.1); b.visible = false; barG.add(b); barBottles.push(b); }
  const barLock = label("🔒", { fs: 60, size: 0.6, bg: false, depth: true }); barLock.position.set(0, 1.6, 0.6); barG.add(barLock);
  // вывеска
  const signWood = label("У СТЕНЫ", { fs: 46, size: 0.45, bg: "#3a2218", col: "#d9c9a0", depth: true, stroke: "#1a0a08" }); signWood.position.set(0, 3.95, WALL_Z + 0.4); scene.add(signWood);
  const neonTex = canvasTex(1024, 200, (g, w, h) => { g.font = "900 120px Rubik, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.shadowColor = "#ff2a5a"; g.shadowBlur = 30; g.fillStyle = "#ff6a8a"; g.fillText("КРАСНЫЙ ФОНАРЬ", w / 2, h / 2); g.shadowBlur = 8; g.fillStyle = "#ffe0e8"; g.fillText("КРАСНЫЙ ФОНАРЬ", w / 2, h / 2); });
  const neon = new THREE.Mesh(new THREE.PlaneGeometry(8, 1.6), new THREE.MeshBasicMaterial({ map: neonTex, transparent: true, depthWrite: false }));
  neon.position.set(0, 4.05, WALL_Z + 0.25); neon.visible = false; scene.add(neon);
  const neonL = new THREE.PointLight("#ff2a6a", 0, 14, 1.4); neonL.position.set(0, 3.6, WALL_Z + 2); scene.add(neonL);
  // ящики и бочки по краям (не на пути)
  for (const [x, z] of [[-5.3, -2.4], [-5.2, 8.2], [6.0, 8.9]]) { const c = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), mat("#4a3020")); c.position.set(x, 0.4, z); c.rotation.y = R(); c.castShadow = true; scene.add(c); }
  // дождь
  const RAIN = 300, rainPos = new Float32Array(RAIN * 6);
  for (let i = 0; i < RAIN; i++) { const x = (R() - 0.5) * 20, y = R() * 12, z = (R() - 0.5) * 16 + 2; rainPos.set([x, y, z, x + 0.03, y - 0.35, z + 0.02], i * 6); }
  const rainG = new THREE.BufferGeometry(); rainG.setAttribute("position", new THREE.BufferAttribute(rainPos, 3));
  const rain = new THREE.LineSegments(rainG, new THREE.LineBasicMaterial({ color: "#9aa8ff", transparent: true, opacity: 0.28 })); scene.add(rain);

  /* ---------- люди ---------- */
  const player = person("man", { coat: "#3a2a4a", hat: "#2a2030", pants: "#1c1824", scarf: "#d7263d", skin: "#e8b896" });
  scene.add(player.root);
  const P = { x: S.px ?? 0, z: S.pz ?? 3.6, vx: 0, vz: 0, yaw: Math.PI, still: 0, carry: [], bottles: [] };
  player.root.position.set(P.x, 0, P.z);
  const ringP = ring(0.55, "#ffd34d", { op: 0.5 }); scene.add(ringP);

  const girls = []; // { def, p, slot, st, t, cl }
  function addGirl(id, slot) {
    const def = GIRL[id];
    const p = person("girl", { dress: def.dress, hair: def.hair, style: def.style, skin: ["#f6d5bd", "#f1c7a5", "#e3b08a", "#c98b62"][slot % 4] });
    p.root.position.set(SPOTS[slot], 0, SPOT_Z); p.root.rotation.y = 0;
    scene.add(p.root);
    const tag = label(def.n + " " + TYPES[def.t].ic, { fs: 34, size: 0.32, bg: "rgba(20,8,20,.7)" }); tag.position.y = 2.15; p.root.add(tag);
    const st = label("", { fs: 34, size: 0.3 }); st.visible = false;
    const cash = { x: SPOTS[slot] + 0.72, z: SPOT_Z + CASH_DZ, coins: [], val: 0 };
    const cr = ring(0.5, "#7ed957", { op: 0.45 }); cr.position.set(cash.x, 0.03, cash.z); scene.add(cr);
    const g = { def, p, slot, st: "idle", t: 0, cl: null, cash, tag, served: S.served[id] || 0, x: SPOTS[slot], z: SPOT_Z };
    girls.push(g);
    return g;
  }
  S.girls.forEach((id, i) => addGirl(id, i));

  const clients = []; let nextId = 1;
  function spawnClient() {
    if (clients.filter((c) => c.st === "wait" || c.st === "arrive").length >= 6) return;
    let type = R() < 0.4 ? "sailor" : R() < 0.55 ? "student" : "rich";
    if (S.bar && R() < (S.neon ? 0.3 : 0.16)) type = "vip";
    const d = CLIENTS[type];
    const p = person("man", { coat: d.coat, hat: d.hat, hatType: type === "sailor" ? "sailor" : type === "rich" || type === "vip" ? "top" : "cap", pants: type === "sailor" ? "#1a2a4a" : "#222", skin: ["#f1c7a5", "#e3b08a", "#c98b62", "#a8714c"][Math.floor(R() * 4)] });
    p.root.position.set(6.5, 0, 12);
    scene.add(p.root);
    const bub = label(d.ic + (type === "vip" ? "🍾" : ""), { fs: 44, size: 0.3, bg: type === "vip" ? "#5a1f2a" : "rgba(255,255,255,.92)", col: "#111", stroke: TYPES[d.likes].col });
    bub.position.y = 2.2; p.root.add(bub);
    const c = { id: nextId++, type, p, st: "arrive", x: 6.5, z: 12, pat: 30, bub, tx: 0, tz: 0, sp: 2.6 + R() * 0.5 };
    clients.push(c);
  }
  // помощник
  let helper = null;
  function makeHelper() {
    const p = person("man", { coat: "#6a5a2a", hat: "#3a2a12", pants: "#2a2218", skin: "#f1c7a5", scarf: "#3aa0c8" });
    p.root.position.set(3.6, 0, 4.4); scene.add(p.root);
    const tg = label("Гоша", { fs: 32, size: 0.3 }); tg.position.y = 2.1; p.root.add(tg);
    helper = { p, x: 3.6, z: 4.4, st: "idle", carry: [], target: null, yaw: 0 };
  }
  if (S.helper) makeHelper();

  /* ---------- площадки покупки ---------- */
  let pad = null;
  function padPos(def) {
    if (def.k === "girl") { const slot = S.girls.length; return { x: SPOTS[slot], z: SPOT_Z + 2.7 }; }
    return PAD_POS[def.k] || DEF_PAD;
  }
  function makePad() {
    if (pad) { scene.remove(pad.g); pad = null; }
    const def = T1_PADS[S.pad];
    if (!def) return;
    const pos = padPos(def);
    const g = new THREE.Group(); g.position.set(pos.x, 0.03, pos.z);
    const r = ring(def.k === "promo" ? 1.0 : 0.85, def.k === "promo" ? "#ffd34d" : "#ff6a8a"); g.add(r);
    const lb = label(def.n + "\n💰 " + def.cost, { fs: 34, size: 0.3, bg: "rgba(30,8,24,.85)", stroke: def.k === "promo" ? "#ffd34d" : "#ff6a8a" });
    lb.position.set(0, 1.1, 0); g.add(lb);
    // силуэт будущей девушки
    if (def.k === "girl") { const gd = GIRL[def.girl]; const ghost = person("girl", { dress: gd.dress, hair: gd.hair, style: gd.style }); ghost.root.traverse((o) => { if (o.material) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = 0.28; } }); ghost.root.position.set(0, 0, -2.7); g.add(ghost.root); }
    scene.add(g);
    pad = { def, g, r, lb, pos, paid: S.padPaid || 0, dwell: 0 };
    r.setProg(pad.paid / def.cost);
  }
  makePad();

  function applyPad(def) {
    app.sfx("buy");
    if (def.k === "girl") { S.girls.push(def.girl); const g = addGirl(def.girl, S.girls.length - 1); poof(g.p.root.position); app.toast(`${GIRL[def.girl].n} теперь у стены ${TYPES[GIRL[def.girl].t].ic}`); }
    if (def.k === "lamp") { S.lamp = 1; buildLamp(); app.toast("Светлее — клиентов больше"); }
    if (def.k === "cap") { S.cap = def.v; app.toast(`Теперь водишь до ${def.v} клиентов`); }
    if (def.k === "bar") { S.bar = 1; buildBar(); app.toast("Бар открыт. VIP 👑 хотят шампанское 🍾"); app.hint("bar"); }
    if (def.k === "speed") { S.speed = 1; app.toast("Быстрее!"); }
    if (def.k === "helper") { S.helper = 1; makeHelper(); app.toast("Гоша сам водит обычных клиентов"); }
    if (def.k === "rooms") { S.rooms = 1; app.toast("Номера отремонтированы: быстрее"); }
    if (def.k === "neon") { S.neon = 1; buildNeon(); app.toast("Неон горит — VIP идут чаще"); }
    if (def.k === "promo") { app.promote(1); return; }
    S.pad++; S.padPaid = 0; makePad(); app.save();
  }
  function buildLamp() { if (!extraLamp && S.lamp) { extraLamp = lampPost(-0.6, 8.5, "#ff8a5a", 11); poof(extraLamp.position); } }
  function buildBar() { barLock.visible = !S.bar; barLight.intensity = S.bar ? 6 : 0; }
  function buildNeon() { neon.visible = !!S.neon; signWood.visible = !S.neon; neonL.intensity = S.neon ? 10 : 0; }
  buildLamp(); buildBar(); buildNeon();
  let barStock = S.bar ? 4 : 0, barT = 0;

  /* ---------- частицы, летящие монеты ---------- */
  function poof(pos) {
    for (let i = 0; i < 14; i++) { const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.08), new THREE.MeshBasicMaterial({ color: ["#ff6a8a", "#ffd34d", "#fff"][i % 3] })); m.position.set(pos.x, 1, pos.z); scene.add(m); fx.push({ m, vx: (R() - 0.5) * 5, vy: 2 + R() * 4, vz: (R() - 0.5) * 5, t: 0.9 }); }
  }
  function floatText(txt, pos, col = "#7ed957") {
    const s = label(txt, { fs: 44, size: 0.42, bg: false, col }); s.position.set(pos.x, 2.4, pos.z); scene.add(s); fx.push({ m: s, vx: 0, vy: 1.2, vz: 0, t: 1.1, txt: true });
  }
  function dropCash(g, val) {
    g.cash.val += val;
    const n = Math.min(14, Math.ceil(g.cash.val / 6));
    while (g.cash.coins.length < n) { const m = coinMesh(); const k = g.cash.coins.length; m.position.set(g.cash.x + ((k % 3) - 1) * 0.12, 0.05 + Math.floor(k / 3) * 0.065, g.cash.z + ((k % 2) - 0.5) * 0.1); scene.add(m); g.cash.coins.push(m); }
  }

  /* ---------- подсказки-стрелки ---------- */
  const arrow = new THREE.Group();
  const ah = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.6, 4), new THREE.MeshBasicMaterial({ color: "#ffd34d" })); ah.rotation.x = Math.PI; arrow.add(ah);
  scene.add(arrow);
  function hintTarget() {
    if (P.carry.length === 0 && !S.everServed && clients.some((c) => c.st === "wait")) return { x: QUEUE.x, z: QUEUE.z, msg: "Подойди к очереди — клиенты пойдут за тобой" };
    if (P.carry.length && !S.everServed) { const g = girls.find((g) => g.st === "idle"); if (g) return { x: g.x, z: g.z + 0.8, msg: `Отведи клиента к ${g.def.n}` }; }
    const cg = girls.find((g) => g.cash.val > 0);
    if (!S.everCash && cg) return { x: cg.cash.x, z: cg.cash.z, msg: "Собери деньги — пройди по монетам" };
    if (pad && app.state.money >= Math.min(pad.def.cost, 30) && S.pad < 2) return { x: pad.pos.x, z: pad.pos.z, msg: "Встань на площадку — покупка" };
    if (P.carry.some((c) => c.type === "vip") && !P.bottles.length) return { x: BAR.x, z: BAR.z, msg: "VIP хочет шампанское — зайди в бар" };
    return null;
  }

  /* ---------- 18+ «заглянуть» ---------- */
  let peekDoor = -1;

  /* ---------- шаг ---------- */
  let spawnT = 1, saveT = 0, hintMsg = "";
  const speedBase = () => 5.2 * (S.speed ? 1.3 : 1);
  function update(dt, input) {
    // игрок
    const sp = speedBase();
    const tvx = input.x * sp, tvz = input.z * sp;
    P.vx = lerp(P.vx, tvx, 1 - Math.exp(-dt * 14)); P.vz = lerp(P.vz, tvz, 1 - Math.exp(-dt * 14));
    P.x += P.vx * dt; P.z += P.vz * dt;
    collide(P);
    const spd = Math.hypot(P.vx, P.vz);
    if (spd > 0.3) P.yaw = angLerp(P.yaw, Math.atan2(P.vx, P.vz), 1 - Math.exp(-dt * 14));
    P.still = spd < 0.6 ? P.still + dt : 0;
    player.root.position.set(P.x, 0, P.z); player.root.rotation.y = P.yaw;
    animPerson(player, dt, spd / sp, P.bottles.length ? "carry" : P.carry.length ? "wave" : "idle");
    ringP.position.set(P.x, 0.03, P.z);
    // бутылки в руках
    P.bottles.forEach((b, i) => { b.position.set(P.x + Math.sin(P.yaw) * 0.35, 1.25 + i * 0.32, P.z + Math.cos(P.yaw) * 0.35); });

    // спавн клиентов
    spawnT -= dt;
    if (spawnT <= 0) { spawnClient(); spawnT = (S.neon ? 2.6 : S.lamp ? 3.4 : 4.4) * (0.75 + R() * 0.5); }
    // очередь: занять места
    const waiting = clients.filter((c) => c.st === "wait" || c.st === "arrive");
    waiting.forEach((c, i) => { c.tx = QUEUE.x + 0.62 * i; c.tz = QUEUE.z + 0.5 * i; });

    // забрать клиентов из очереди (стоя рядом ~0,25 c)
    const nearQ = Math.hypot(P.x - QUEUE.x, P.z - QUEUE.z) < 1.6;
    if (nearQ && P.still > 0.2 && P.carry.length < (S.cap || 2)) {
      const c = clients.find((c) => c.st === "wait");
      if (c && (P.pickT = (P.pickT || 0) - dt) <= 0) { c.st = "follow"; c.leader = P; P.carry.push(c); P.pickT = 0.22; app.sfx("pick"); app.haptic("light"); }
    }
    // бар: взять шампанское
    if (S.bar && Math.hypot(P.x - BAR.x, P.z - BAR.z) < 1.4 && P.still > 0.2 && barStock > 0 && P.bottles.length < 2) {
      if ((P.bT = (P.bT || 0) - dt) <= 0) { barStock--; const b = bottle(); scene.add(b); P.bottles.push(b); P.bT = 0.3; app.sfx("pick"); }
    }
    if (S.bar) { barT += dt; if (barT > 2.5 && barStock < 4) { barStock++; barT = 0; } }
    barBottles.forEach((b, i) => (b.visible = i < barStock));

    // отдать клиента девушке
    for (const g of girls) {
      if (g.st !== "idle" || !P.carry.length) continue;
      if (Math.hypot(P.x - g.x, P.z - (g.z + 0.9)) > 1.05 || P.still < 0.15) continue;
      let c = P.carry[0];
      if (c.type === "vip" && !P.bottles.length) { const alt = P.carry.find((k) => k.type !== "vip"); if (alt) c = alt; else { if (!g.warn) { app.toast("VIP 👑 без шампанского не пойдёт — возьми 🍾 в баре"); g.warn = 2; } continue; } }
      if (c.type === "vip") { const b = P.bottles.pop(); scene.remove(b); }
      P.carry.splice(P.carry.indexOf(c), 1);
      assign(g, c);
    }
    girls.forEach((g) => { if (g.warn) g.warn = Math.max(0, g.warn - dt); });

    // помощник
    if (helper) stepHelper(dt);

    // клиенты
    for (const c of clients) stepClient(c, dt);
    for (let i = clients.length - 1; i >= 0; i--) if (clients[i].st === "gone") { scene.remove(clients[i].p.root); clients.splice(i, 1); }

    // девушки
    for (const g of girls) stepGirl(g, dt);

    // сбор денег
    for (const g of girls) {
      if (g.cash.val > 0 && Math.hypot(P.x - g.cash.x, P.z - g.cash.z) < 1.0) {
        const v = Math.round(g.cash.val); g.cash.val = 0;
        for (const m of g.cash.coins) fx.push({ m, fly: true, t: 0.45 });
        g.cash.coins = [];
        app.addMoney(v); floatText("+" + v, g.cash, "#ffd34d"); app.sfx("cash"); app.haptic("light");
        S.everCash = 1;
      }
    }

    // площадка покупки
    if (pad) {
      const on = Math.hypot(P.x - pad.pos.x, P.z - pad.pos.z) < pad.r.userData.r && spd < 2.5;
      pad.dwell = on ? pad.dwell + dt : 0;
      if (on && pad.dwell > 0.35 && app.state.money > 0) {
        const rate = Math.max(30, pad.def.cost / 1.4) * dt;
        const pay = Math.min(rate, app.state.money, pad.def.cost - pad.paid);
        pad.paid += pay; app.addMoney(-pay, true); S.padPaid = pad.paid;
        pad.r.setProg(pad.paid / pad.def.cost);
        if ((pad.tick = (pad.tick || 0) + dt) > 0.12) { pad.tick = 0; app.sfx("tick"); }
        if (pad.paid >= pad.def.cost - 0.01) { const d = pad.def; poof(pad.pos); applyPad(d); }
      }
      if (pad) { pad.g.children[0].rotation.z += dt * 0.3; pad.lb.position.y = 1.1 + Math.sin(performance.now() / 300) * 0.05; }
    }

    // «заглянуть» — когда стоишь у занятой двери
    peekDoor = -1;
    for (const g of girls) if (g.st === "room" && Math.abs(P.x - g.x) < 1.3 && P.z < SPOT_Z + 2.2) peekDoor = g.slot;
    app.peek(peekDoor >= 0 ? girls.find((g) => g.slot === peekDoor) : null);

    // двери
    doors.forEach((d, i) => {
      const g = girls.find((g) => g.slot === i);
      const busy = g && g.st === "room";
      const gl = lerp(d.pl.material.opacity, busy ? 0.75 + Math.sin(performance.now() / 180) * 0.15 : g ? 0.18 : 0, 1 - Math.exp(-dt * 6));
      d.pl.material.opacity = gl; d.pool.material.opacity = gl * 0.8;
      d.lampM.color.set(busy ? "#ff2a3a" : g ? "#6a1a1a" : "#2a1010");
      d.open = lerp(d.open, (g && (g.st === "toRoom" || g.st === "out")) ? 1 : 0, 1 - Math.exp(-dt * 8));
      d.d.rotation.y = d.open * 1.2; d.d.position.x = d.x - Math.sin(d.open * 1.2) * 0.5 + d.open * 0.0;
    });

    // эффекты
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i]; f.t -= dt;
      if (f.fly) { f.m.position.lerp(new THREE.Vector3(P.x, 1.4, P.z), 1 - Math.exp(-dt * 12)); f.m.scale.multiplyScalar(0.97); }
      else { f.vy -= f.txt ? 0 : 9 * dt; f.m.position.x += f.vx * dt; f.m.position.y += f.vy * dt; f.m.position.z += f.vz * dt; if (f.txt) f.m.material.opacity = Math.min(1, f.t * 2); }
      if (f.t <= 0) { scene.remove(f.m); fx.splice(i, 1); }
    }
    // дождь
    const rp = rainG.attributes.position.array;
    for (let i = 0; i < RAIN; i++) { const o = i * 6; rp[o + 1] -= 14 * dt; rp[o + 4] -= 14 * dt; if (rp[o + 4] < 0) { rp[o + 1] += 12; rp[o + 4] += 12; } }
    rainG.attributes.position.needsUpdate = true;
    if (S.neon) { const fl = Math.random() < 0.02 ? 0.3 : 1; neon.material.opacity = fl; neonL.intensity = 10 * fl; }

    // подсказка
    const h = hintTarget();
    arrow.visible = !!h;
    if (h) { arrow.position.set(h.x, 2.6 + Math.sin(performance.now() / 200) * 0.25, h.z); arrow.rotation.y += dt * 3; }
    const msg = h ? h.msg : "";
    if (msg !== hintMsg) { hintMsg = msg; app.tip(msg); }

    // камера
    const asp = window.innerWidth / window.innerHeight, portrait = asp < 1;
    const cx = clamp(P.x, portrait ? -1.6 : 0, portrait ? 1.8 : 0), cz = clamp(P.z, 0.5, 4.6);
    const fov = portrait ? 46 : 42; if (cam.fov !== fov) { cam.fov = fov; cam.updateProjectionMatrix(); }
    const H = portrait ? 22 : 13, BZ = portrait ? 8.5 : 7.5;
    cam.position.x = lerp(cam.position.x, cx, 1 - Math.exp(-dt * 5));
    cam.position.y = H; cam.position.z = lerp(cam.position.z, cz + BZ + 0.3, 1 - Math.exp(-dt * 5));
    cam.lookAt(cam.position.x, 0, cam.position.z - BZ);
    moon.position.set(cam.position.x - 8, 16, cam.position.z);
    moon.target.position.set(cam.position.x, 0, cam.position.z - 10);

    saveT += dt; if (saveT > 3) { saveT = 0; S.px = P.x; S.pz = P.z; app.save(); }
    app.setProgress(S.pad / (T1_PADS.length - 1), `Этап 1 · улучшений ${S.pad}/${T1_PADS.length - 1}`);
  }

  function assign(g, c) {
    g.st = "wait"; g.cl = c; c.st = "toGirl"; c.girl = g; c.tx = g.x + 0.45; c.tz = g.z + 0.5;
    app.sfx("ok"); app.haptic("medium");
  }
  function stepGirl(g, dt) {
    const p = g.p;
    if (g.st === "idle") { animPerson(p, dt, 0, "lean"); p.root.rotation.y = angLerp(p.root.rotation.y, Math.atan2(P.x - g.x, P.z - g.z) * 0.4, dt * 3); return; }
    if (g.st === "wait") { animPerson(p, dt, 0, "wave"); if (g.cl.st === "atGirl") { g.st = "toRoom"; g.t = 0; } return; }
    if (g.st === "toRoom") {
      g.t += dt; const k = Math.min(1, g.t / 0.9);
      p.root.position.z = lerp(SPOT_Z, WALL_Z + 0.2, k); p.root.rotation.y = Math.PI; animPerson(p, dt, 0.5, "idle");
      const c0 = g.cl; c0.x = lerp(c0.x, g.x + 0.2, k); c0.z = lerp(SPOT_Z + 0.5, WALL_Z + 0.3, k); c0.p.root.position.set(c0.x, 0, c0.z); c0.p.root.rotation.y = Math.PI; animPerson(c0.p, dt, 0.5, "idle");
      if (k >= 1) { g.st = "room"; g.t = 0; p.root.visible = false; g.cl.p.root.visible = false; g.dur = (S.rooms ? 3.0 : 4.6) * (g.cl.type === "vip" ? 1.4 : 1); }
      return;
    }
    if (g.st === "room") {
      g.t += dt;
      if (g.t >= g.dur) {
        g.st = "out"; g.t = 0; p.root.visible = true; g.cl.p.root.visible = true;
        const c = g.cl; const match = CLIENTS[c.type].likes === g.def.t;
        const val = Math.round(BASE_PAY[c.type] * (match ? 1.5 : 1));
        dropCash(g, val);
        floatText((match ? "❤️ " : "") + "+" + val, { x: g.x, z: g.z + 1 }, match ? "#ff8fc7" : "#7ed957");
        g.served++; S.served[g.def.id] = g.served; S.everServed = 1;
        if (g.served === 8) app.unlockScene(`SC18-T1-${g.def.id.toUpperCase()}-2`, `${g.def.n}: новая сцена в альбоме`);
        if (c.type === "vip") app.unlockScene("SC18-T1-VIP", "VIP-номер: сцена в альбоме");
        c.st = "leave"; c.tx = -1 + R() * 4; c.tz = 13; c.happy = match;
        c.bub.material.map.dispose(); c.p.root.remove(c.bub);
        const h = label(match ? "😍" : "🙂", { fs: 50, size: 0.4, bg: false }); h.position.y = 2.2; c.p.root.add(h);
      }
      return;
    }
    if (g.st === "out") {
      g.t += dt; const k = Math.min(1, g.t / 0.8);
      p.root.position.z = lerp(WALL_Z + 0.2, SPOT_Z, k); p.root.rotation.y = 0; animPerson(p, dt, 0.5, "idle");
      if (k >= 1) { g.st = "idle"; g.cl = null; }
    }
  }
  function stepClient(c, dt) {
    let tx = c.tx, tz = c.tz, sp = c.sp;
    if (c.st === "follow") {
      const L = c.leader, arr = L.carry, i = arr.indexOf(c);
      const ahead = i === 0 ? { x: L.x, z: L.z } : { x: arr[i - 1].x, z: arr[i - 1].z };
      const d = Math.hypot(ahead.x - c.x, ahead.z - c.z);
      if (d > 0.85) { tx = ahead.x; tz = ahead.z; sp = Math.max(3, d * 4.5); } else { tx = c.x; tz = c.z; }
    }
    if (c.st === "atGirl" || c.st === "inRoom") return;
    const dx = tx - c.x, dz = tz - c.z, d = Math.hypot(dx, dz);
    let moving = 0;
    if (d > 0.05) { const st = Math.min(d, sp * dt); c.x += (dx / d) * st; c.z += (dz / d) * st; moving = st / dt / 4; c.p.root.rotation.y = angLerp(c.p.root.rotation.y, Math.atan2(dx, dz), 1 - Math.exp(-dt * 10)); }
    c.p.root.position.set(c.x, 0, c.z);
    animPerson(c.p, dt, moving, "idle");
    if (c.st === "arrive" && d < 0.1) c.st = "wait";
    if (c.st === "wait") {
      c.p.root.rotation.y = angLerp(c.p.root.rotation.y, -Math.PI / 2, dt * 4);
      c.pat -= dt;
      if (c.pat < 8) c.bub.material.opacity = 0.5 + 0.5 * Math.abs(Math.sin(performance.now() / 150));
      if (c.pat <= 0) { c.st = "leave"; c.tx = 6.5; c.tz = 13; app.lost(); const h = label("😤", { fs: 50, size: 0.4, bg: false }); h.position.y = 2.6; c.p.root.add(h); }
    }
    if (c.st === "toGirl" && d < 0.12) { c.st = "atGirl"; c.p.root.rotation.y = Math.PI; }
    if (c.st === "leave" && c.z > 12.5) c.st = "gone";
  }
  function stepHelper(dt) {
    const H = helper;
    const free = girls.filter((g) => g.st === "idle" && !g.reserved);
    if (H.st === "idle") {
      const q = clients.find((c) => c.st === "wait" && c.type !== "vip");
      if (q && free.length) { H.st = "toQ"; }
    }
    let tx = H.x, tz = H.z;
    if (H.st === "toQ") {
      tx = QUEUE.x - 0.9; tz = QUEUE.z + 0.4;
      if (Math.hypot(H.x - tx, H.z - tz) < 0.3) {
        const n = Math.min(2, free.length);
        for (const c of clients) if (c.st === "wait" && c.type !== "vip" && H.carry.length < n) { c.st = "follow"; c.leader = H; H.carry.push(c); }
        H.st = H.carry.length ? "toG" : "idle";
        H.target = null;
      }
    }
    if (H.st === "toG") {
      if (!H.target || H.target.st !== "idle") { H.target = girls.find((g) => g.st === "idle" && !g.reserved); if (H.target) H.target.reserved = true; }
      if (!H.target) { tx = H.x; tz = H.z; }
      else {
        tx = H.target.x + 0.9; tz = H.target.z + 1.0;
        if (Math.hypot(H.x - tx, H.z - tz) < 0.3) {
          const c = H.carry.shift(); H.target.reserved = false; assign(H.target, c); H.target = null;
          if (!H.carry.length) H.st = "idle";
        }
      }
    }
    if (H.st === "idle") { tx = 4.4; tz = 4.8; }
    const dx = tx - H.x, dz = tz - H.z, d = Math.hypot(dx, dz), sp = 3.4;
    let mv = 0;
    if (d > 0.05) { const st = Math.min(d, sp * dt); H.x += (dx / d) * st; H.z += (dz / d) * st; mv = 0.8; H.yaw = angLerp(H.yaw, Math.atan2(dx, dz), 1 - Math.exp(-dt * 10)); }
    H.p.root.position.set(H.x, 0, H.z); H.p.root.rotation.y = H.yaw;
    animPerson(H.p, dt, mv, H.carry.length ? "wave" : "idle");
  }
  // столкновения: только мягкое выталкивание из бара/скамьи/тумбы + границы — застрять негде
  const OB = [{ x: BAR.x - 1.35, z: BAR.z, rx: 0.5, rz: 1.25 }, { x: bench.position.x, z: bench.position.z, rx: 1.4, rz: 0.45 }, { x: 5.9, z: 2.0, rx: 0.75, rz: 0.75 }];
  function collide(o) {
    o.x = clamp(o.x, BOUNDS.x0, BOUNDS.x1); o.z = clamp(o.z, BOUNDS.z0, BOUNDS.z1);
    for (const b of OB) {
      const dx = o.x - b.x, dz = o.z - b.z, px = b.rx + 0.3 - Math.abs(dx), pz = b.rz + 0.3 - Math.abs(dz);
      if (px > 0 && pz > 0) { if (px < pz) o.x += Math.sign(dx) * px; else o.z += Math.sign(dz) * pz; }
    }
  }

  cam.position.set(clamp(P.x, -1.6, 1.8), 17.5, clamp(P.z, 0.5, 4.6) + 4.8);
  return {
    scene, cam, clients, girls, P, pad: () => pad,
    update,
    render() { renderer.render(scene, cam); },
    resize() { resize(cam); },
    peekGirl() { const g = girls.find((g) => g.slot === peekDoor); return g; },
    debugPad() { if (pad) { app.addMoney(Math.max(0, pad.def.cost - pad.paid)); } },
    dispose() { scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); },
  };
}
