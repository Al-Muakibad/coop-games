// ЭТАП 1 «Переулок» — аркадный айдл с цепочкой, как в «Промысле».
// Цепочка: очередь клиентов → девушка у стены → номер → грязное бельё → прачечная → чистое бельё в номер;
// бар → шампанское девушке → к ней можно вести VIP; деньги копятся у мест.
// Каждое звено закрывает свой помощник (Гоша, Зина, Пьер, Сёма). Все улучшения — в одном месте, в «Конторе»,
// карточки «было → станет», видно уровень и сколько вложено.
import { THREE, renderer, resize, mat, person, animPerson, label, ring, coinMesh, bottle, cobbleTex, brickTex, canvasTex, clamp, lerp, angLerp, rnd, GLOW } from "./c3d.js";
import { GIRL, CLIENTS, TYPES } from "./data.js";

const SPOTS = [-3.3, -1.1, 1.1, 3.3];
const WALL_Z = -5, SPOT_Z = -3.9;
const QUEUE = { x: 2.6, z: 6.2 }, BAR = { x: -3.5, z: 5.7 }, LAUNDRY = { x: -3.5, z: 1.6 }, OFFICE = { x: 3.7, z: 1.9 };
const BOUNDS = { x0: -4.5, x1: 4.75, z0: -3.2, z1: 8.2 };
const BASE_PAY = { sailor: 16, student: 13, rich: 23, vip: 60 };
export const T1_GOAL = 4000; // заработать всего — и можно на повышение

// открытия в мире: место всегда одно и то же и рядом с тем, что открывается
export const T1_UNLOCKS = [
  { id: "mimi", n: "Мими встанет у стены", cost: 40, girl: "mimi", slot: 1 },
  { id: "bar", n: "Открыть бар: шампанское → VIP", cost: 220, need: "mimi" },
  { id: "vivien", n: "Вивьен встанет у стены", cost: 260, girl: "vivien", slot: 2, need: "mimi" },
  { id: "carmen", n: "Кармен встанет у стены", cost: 700, girl: "carmen", slot: 3, need: "vivien" },
];
// улучшения в Конторе: ур. 0..max, цена base·1.6^ур.
const pct = (v) => Math.round(v * 100) + "%";
export const T1_UPG = [
  { id: "p_speed", g: "Ты", ic: "👞", n: "Лаковые туфли", d: "скорость ходьбы", max: 5, base: 35, v: (l) => (5.2 * (1 + 0.1 * l)).toFixed(1) + " м/с" },
  { id: "p_lead", g: "Ты", ic: "🎩", n: "Обаяние", d: "сколько клиентов ведёшь", max: 4, base: 45, v: (l) => 2 + l + " чел." },
  { id: "p_hands", g: "Ты", ic: "👜", n: "Сумка", d: "сколько вещей в руках", max: 4, base: 35, v: (l) => 2 + l + " шт." },
  { id: "g_lola", g: "Девушки", ic: "💃", n: "Лола: наряды", d: "оплата и скорость", max: 5, base: 50, girl: "lola", v: (l) => "×" + (1 + 0.25 * l).toFixed(2) },
  { id: "g_mimi", g: "Девушки", ic: "💃", n: "Мими: наряды", d: "оплата и скорость", max: 5, base: 60, girl: "mimi", v: (l) => "×" + (1 + 0.25 * l).toFixed(2) },
  { id: "g_vivien", g: "Девушки", ic: "💃", n: "Вивьен: наряды", d: "оплата и скорость", max: 5, base: 80, girl: "vivien", v: (l) => "×" + (1 + 0.25 * l).toFixed(2) },
  { id: "g_carmen", g: "Девушки", ic: "💃", n: "Кармен: наряды", d: "оплата и скорость", max: 5, base: 110, girl: "carmen", v: (l) => "×" + (1 + 0.25 * l).toFixed(2) },
  { id: "rooms", g: "Хозяйство", ic: "🛏", n: "Номера", d: "время в номере", max: 5, base: 70, v: (l) => (4.6 * 0.86 ** l).toFixed(1) + " с" },
  { id: "laundry", g: "Хозяйство", ic: "🧺", n: "Прачечная", d: "бельё: скорость · запас", max: 5, base: 45, v: (l) => (3.2 * 0.82 ** l).toFixed(1) + " с · " + (4 + 2 * l) },
  { id: "bar", g: "Хозяйство", ic: "🍾", n: "Бар", d: "шампанское: скорость · запас", max: 5, base: 80, need: "bar", v: (l) => (3 * 0.82 ** l).toFixed(1) + " с · " + (3 + l) },
  { id: "ads", g: "Хозяйство", ic: "🏮", n: "Реклама", d: "клиент каждые · доля VIP", max: 5, base: 60, v: (l, S) => (4.4 * 0.85 ** l).toFixed(1) + " с" + (S.un.bar ? " · " + pct(0.12 + 0.04 * l) : "") },
  { id: "h_gosha", g: "Помощники", ic: "🧑", n: "Гоша — водит клиентов", d: "нанять, потом скорость и сколько ведёт", max: 4, base: 90, v: (l) => (l ? `ур.${l}: ${l} чел., ${hSpeed(l).toFixed(1)} м/с` : "не нанят") },
  { id: "h_zina", g: "Помощники", ic: "👩", n: "Зина — носит бельё", d: "нанять, потом скорость и сколько несёт", max: 4, base: 70, v: (l) => (l ? `ур.${l}: ${l} шт., ${hSpeed(l).toFixed(1)} м/с` : "не нанята") },
  { id: "h_pierre", g: "Помощники", ic: "🤵", n: "Пьер — разносит шампанское", d: "нанять, потом скорость", max: 4, base: 180, need: "bar", v: (l) => (l ? `ур.${l}: ${l} шт., ${hSpeed(l).toFixed(1)} м/с` : "не нанят") },
  { id: "h_sema", g: "Помощники", ic: "🧮", n: "Сёма — собирает выручку", d: "нанять, потом скорость", max: 4, base: 150, v: (l) => (l ? `ур.${l}: ${hSpeed(l).toFixed(1)} м/с` : "не нанят") },
];
const hSpeed = (l) => 2.8 * (1 + 0.2 * (l - 1));
export const upgCost = (u, l) => Math.round(u.base * 1.6 ** l);

export function createT1(app) {
  const S = app.state.t1;
  S.lv ||= {}; S.spent ||= {}; S.un ||= {}; S.served ||= {}; S.earned ||= 0;
  const lv = (id) => S.lv[id] || 0;
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
  const bench = new THREE.Group();
  const seat = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.12, 0.6), mat("#5a3a22")); seat.position.y = 0.5; bench.add(seat);
  const back = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.6, 0.1), mat("#5a3a22")); back.position.set(0, 0.85, 0.28); bench.add(back);
  for (const sx of [-1.1, 1.1]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 0.5), mat("#1c1c22")); l.position.set(sx, 0.25, 0); bench.add(l); }
  bench.position.set(QUEUE.x + 1.9, 0, QUEUE.z + 2.0); bench.rotation.y = Math.PI * 0.85; scene.add(bench);
  // постройки у края: кабинка с крышей, вывеской и зоной перед ней (зона всегда обращена к камере)
  function booth(pos, side, roofCol, title, wood) {
    const g = new THREE.Group(); g.position.set(pos.x + side * 1.35, 0, pos.z); g.rotation.y = -side * Math.PI / 2; scene.add(g);
    const counter = new THREE.Mesh(new THREE.BoxGeometry(2.3, 1.05, 0.85), mat(wood || "#6a3a22")); counter.position.y = 0.52; counter.castShadow = true; g.add(counter);
    const back = new THREE.Mesh(new THREE.BoxGeometry(2.5, 2.6, 0.2), mat("#2a1a1c")); back.position.set(0, 1.3, -0.55); g.add(back);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.15, 1.6), mat(roofCol)); roof.position.set(0, 2.55, -0.2); roof.rotation.x = 0.12; g.add(roof);
    for (const sx of [-1.2, 1.2]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.5, 0.12), mat("#3a2218")); p.position.set(sx, 1.25, 0.3); g.add(p); }
    const sign = label(title, { fs: 40, size: 0.32, bg: "#2a0a12", col: "#ffd34d", depth: true }); sign.position.set(0, 2.95, 0.45); g.add(sign);
    const light = new THREE.PointLight("#ffd08a", 0, 6, 1.6); light.position.set(0, 2.2, 0.9); g.add(light);
    const zone = ring(1.05, "#8fd8ff", { op: 0.55 }); zone.position.set(pos.x, 0.03, pos.z); scene.add(zone);
    return { g, light, sign, zone, counter };
  }
  const laundry = booth(LAUNDRY, -1, "#3a6a8a", "ПРАЧЕЧНАЯ 🧺", "#8a8a9a");
  laundry.light.intensity = 5;
  const tubs = []; for (let i = 0; i < 12; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 0.32), mat("#f2f0ea")); b.position.set(-0.8 + (i % 4) * 0.52, 1.12 + Math.floor(i / 4) * 0.15, 0.05); b.visible = false; laundry.g.add(b); tubs.push(b); }
  const bar = booth(BAR, -1, "#8a1a2a", "БАР 🍾");
  const barBottles = []; for (let i = 0; i < 8; i++) { const b = bottle(); b.position.set(-0.85 + (i % 4) * 0.55, 1.22 + Math.floor(i / 4) * 0.34, 0.05 + Math.floor(i / 4) * -0.2); b.visible = false; bar.g.add(b); barBottles.push(b); }
  const office = booth(OFFICE, 1, "#2a4a2a", "КОНТОРА 📒", "#4a3a2a");
  office.light.intensity = 5; office.zone.children[0].material.color.set("#ffd34d");
  const ledger = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.06, 0.45), mat("#7a1a1a")); ledger.position.set(0, 1.08, 0.05); office.g.add(ledger);
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
  // прохожие, трамвай и кошка — чтобы улица жила
  const passers = [];
  for (let i = 0; i < 5; i++) {
    const p = person("man", { coat: ["#4a4a5a", "#5a3a2a", "#2a3a4a", "#3a2a3a", "#4a5a3a"][i], hat: "#222", pants: "#1a1a1a" });
    p.root.scale.setScalar(0.92); scene.add(p.root);
    passers.push({ p, x: -14 + R() * 28, z: 9.5 + R() * 0.9, dir: R() < 0.5 ? 1 : -1, sp: 1.2 + R() * 0.7 });
  }
  const tram = new THREE.Group();
  const tb = new THREE.Mesh(new THREE.BoxGeometry(7, 2.2, 2.0), mat("#b8862a")); tb.position.y = 1.4; tram.add(tb);
  const tr2 = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.25, 2.1), mat("#5a1a1a")); tr2.position.y = 2.6; tram.add(tr2);
  for (let i = 0; i < 6; i++) { const w = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.7), new THREE.MeshBasicMaterial({ color: "#ffd890" })); w.position.set(-2.8 + i * 1.1, 1.7, -1.01); w.rotation.y = Math.PI; tram.add(w); }
  const tramL = new THREE.PointLight("#ffd890", 0, 7, 1.5); tramL.position.set(0, 1.5, -1.6); tram.add(tramL);
  tram.position.set(-40, 0, 12.6); scene.add(tram);
  let tramT = 8, tramX = -40;

  /* ---------- игрок ---------- */
  const player = person("man", { coat: "#3a2a4a", hat: "#2a2030", pants: "#1c1824", scarf: "#d7263d", skin: "#e8b896" });
  scene.add(player.root);
  const P = { x: S.px ?? 0, z: S.pz ?? 3.4, vx: 0, vz: 0, yaw: Math.PI, still: 0, carry: [], hands: [] };
  player.root.position.set(P.x, 0, P.z);
  const ringP = ring(0.55, "#ffd34d", { op: 0.5 }); scene.add(ringP);
  // лёгкая подсветка вокруг героя
  const pLight = new THREE.PointLight("#ffd9a8", 4, 5.5, 1.6); scene.add(pLight);
  const pGlow = new THREE.Mesh(new THREE.CircleGeometry(1.5, 28), new THREE.MeshBasicMaterial({ map: GLOW, color: "#ffcf8a", blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.35 }));
  pGlow.rotation.x = -Math.PI / 2; scene.add(pGlow);

  /* ---------- девушки ---------- */
  const girls = [];
  function addGirl(id, slot) {
    const def = GIRL[id];
    const p = person("girl", { dress: def.dress, hair: def.hair, style: def.style, skin: ["#f6d5bd", "#f1c7a5", "#e3b08a", "#c98b62"][slot % 4] });
    p.root.position.set(SPOTS[slot], 0, SPOT_Z); scene.add(p.root);
    const tag = label(def.n + " " + TYPES[def.t].ic, { fs: 34, size: 0.32, bg: "rgba(20,8,20,.7)" }); tag.position.y = 2.15; p.root.add(tag);
    const need = label("🧺", { fs: 56, size: 0.5, bg: "#8fd8ff", col: "#111" }); need.position.y = 2.75; need.visible = false; p.root.add(need);
    const champ = bottle(); champ.position.set(0.32, 0.95, 0.15); champ.visible = false; p.root.add(champ);
    const cash = { x: SPOTS[slot] + 0.72, z: SPOT_Z + 1.45, coins: [], val: 0 };
    const cr = ring(0.5, "#7ed957", { op: 0.45 }); cr.position.set(cash.x, 0.03, cash.z); scene.add(cr);
    const g = { def, p, slot, st: "idle", t: 0, cl: null, cash, need, champ, bottle: !!(S.bottles || {})[id], res: null, x: SPOTS[slot], z: SPOT_Z, served: S.served[id] || 0 };
    if ((S.dirty || {})[id]) g.st = "dirty";
    girls.push(g);
    return g;
  }
  addGirl("lola", 0);
  for (const u of T1_UNLOCKS) if (u.girl && S.un[u.id]) addGirl(u.girl, u.slot);

  /* ---------- клиенты ---------- */
  const clients = [];
  function spawnClient() {
    if (clients.filter((c) => c.st === "wait" || c.st === "arrive").length >= 7) return;
    let type = R() < 0.4 ? "sailor" : R() < 0.55 ? "student" : "rich";
    if (S.un.bar && R() < 0.12 + 0.04 * lv("ads")) type = "vip";
    const d = CLIENTS[type];
    const p = person("man", { coat: d.coat, hat: d.hat, hatType: type === "sailor" ? "sailor" : type === "rich" || type === "vip" ? "top" : "cap", pants: type === "sailor" ? "#1a2a4a" : "#222", skin: ["#f1c7a5", "#e3b08a", "#c98b62", "#a8714c"][Math.floor(R() * 4)] });
    p.root.position.set(6.5, 0, 12); scene.add(p.root);
    const bub = label(d.ic + (type === "vip" ? "🍾" : ""), { fs: 44, size: 0.3, bg: type === "vip" ? "#5a1f2a" : "rgba(255,255,255,.92)", col: "#111", stroke: TYPES[d.likes].col });
    bub.position.y = 2.2; p.root.add(bub);
    clients.push({ type, p, st: "arrive", x: 6.5, z: 12, pat: 34, bub, tx: 0, tz: 0, sp: 2.6 + R() * 0.5 });
  }

  /* ---------- помощники ---------- */
  const HELP = {
    h_gosha: { n: "Гоша", coat: "#6a5a2a", scarf: "#3aa0c8", home: { x: 2.0, z: 4.6 } },
    h_zina: { n: "Зина", girl: true, dress: "#4a6a8a", hair: "#6a4a2a", home: { x: -2.4, z: 2.6 } },
    h_pierre: { n: "Пьер", coat: "#1a1a1a", scarf: "#f2f2f2", home: { x: -2.3, z: 5.0 } },
    h_sema: { n: "Сёма", coat: "#2a4a2a", scarf: "#ffd34d", home: { x: 2.4, z: 2.4 } },
  };
  const helpers = {};
  function makeHelper(id) {
    if (helpers[id] || !lv(id)) return;
    const d = HELP[id];
    const p = d.girl ? person("girl", { dress: d.dress, hair: d.hair, style: "bun" }) : person("man", { coat: d.coat, hat: "#2a2018", pants: "#222", scarf: d.scarf });
    p.root.position.set(d.home.x, 0, d.home.z); scene.add(p.root);
    const tg = label(d.n, { fs: 30, size: 0.28, bg: "rgba(10,40,60,.8)" }); tg.position.y = 2.1; p.root.add(tg);
    helpers[id] = { id, d, p, x: d.home.x, z: d.home.z, yaw: 0, st: "idle", carry: [], hands: [], target: null, stuck: 0 };
    poof(p.root.position);
  }

  /* ---------- открытия в мире ---------- */
  const pads = {};
  function unlockPos(u) { return u.girl ? { x: SPOTS[u.slot], z: SPOT_Z + 2.6 } : { x: BAR.x, z: BAR.z }; }
  function refreshPads() {
    for (const u of T1_UNLOCKS) {
      const show = !S.un[u.id] && (!u.need || S.un[u.need]);
      if (show && !pads[u.id]) {
        const pos = unlockPos(u);
        const g = new THREE.Group(); g.position.set(pos.x, 0.03, pos.z);
        const r = ring(0.8, "#ff6a8a"); g.add(r);
        const lb = label(u.n + "\n💰 " + u.cost, { fs: 32, size: 0.28, bg: "rgba(30,8,24,.88)", stroke: "#ff6a8a" }); lb.position.y = 1.1; g.add(lb);
        if (u.girl) { const gd = GIRL[u.girl]; const ghost = person("girl", { dress: gd.dress, hair: gd.hair, style: gd.style }); ghost.root.traverse((o) => { if (o.material) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = 0.28; } }); ghost.root.position.set(0, 0, -2.6); g.add(ghost.root); }
        scene.add(g);
        pads[u.id] = { u, g, r, pos, paid: (S.padPaid || {})[u.id] || 0, dwell: 0 };
        r.setProg(pads[u.id].paid / u.cost);
      }
      if (!show && pads[u.id]) { scene.remove(pads[u.id].g); delete pads[u.id]; }
    }
    bar.sign.visible = !!S.un.bar; bar.light.intensity = S.un.bar ? 6 : 0; bar.zone.visible = !!S.un.bar;
  }
  refreshPads();
  function doUnlock(u) {
    S.un[u.id] = 1; app.sfx("buy"); poof(unlockPos(u));
    if (u.girl) { const g = addGirl(u.girl, u.slot); app.toast(`${g.def.n} теперь у стены ${TYPES[g.def.t].ic}`); }
    if (u.id === "bar") { barStock = 2; app.toast("Бар открыт: отнеси 🍾 девушке — к ней можно вести VIP 👑"); }
    refreshPads(); app.save();
  }

  /* ---------- улучшения (вызываются из Конторы) ---------- */
  function buyUpg(id) {
    const u = T1_UPG.find((x) => x.id === id); const l = lv(id), c = upgCost(u, l);
    if (l >= u.max || app.state.money < c || (u.need && !S.un[u.need]) || (u.girl && u.girl !== "lola" && !S.un[u.girl])) return false;
    app.addMoney(-c, true); S.lv[id] = l + 1; S.spent[id] = (S.spent[id] || 0) + c;
    if (id.startsWith("h_")) makeHelper(id);
    if (id === "ads") buildAds();
    app.sfx("buy"); app.haptic("medium"); app.save();
    return true;
  }
  function buildAds() {
    if (lv("ads") >= 1 && !extraLamp) { extraLamp = lampPost(-0.6, 8.5, "#ff8a5a", 11); }
    const on = lv("ads") >= 3; neon.visible = on; signWood.visible = !on; neonL.intensity = on ? 10 : 0;
  }
  buildAds();
  for (const id of Object.keys(HELP)) makeHelper(id);
  let barStock = S.un.bar ? (S.barStock ?? 2) : 0, barT = 0, linen = S.linen ?? 2, linT = 0;

  /* ---------- эффекты ---------- */
  function poof(pos) { for (let i = 0; i < 14; i++) { const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.08), new THREE.MeshBasicMaterial({ color: ["#ff6a8a", "#ffd34d", "#fff"][i % 3] })); m.position.set(pos.x, 1, pos.z); scene.add(m); fx.push({ m, vx: (R() - 0.5) * 5, vy: 2 + R() * 4, vz: (R() - 0.5) * 5, t: 0.9 }); } }
  function floatText(txt, pos, col = "#7ed957") { const s = label(txt, { fs: 44, size: 0.42, bg: false, col }); s.position.set(pos.x, 2.4, pos.z); scene.add(s); fx.push({ m: s, vx: 0, vy: 1.2, vz: 0, t: 1.1, txt: true }); }
  function dropCash(g, val) {
    g.cash.val += val;
    const n = Math.min(15, Math.ceil(g.cash.val / 8));
    while (g.cash.coins.length < n) { const m = coinMesh(); const k = g.cash.coins.length; m.position.set(g.cash.x + ((k % 3) - 1) * 0.12, 0.05 + Math.floor(k / 3) * 0.065, g.cash.z + ((k % 2) - 0.5) * 0.1); scene.add(m); g.cash.coins.push(m); }
  }
  function takeCash(g, who) {
    const v = Math.round(g.cash.val); if (!v) return 0; g.cash.val = 0;
    for (const m of g.cash.coins) fx.push({ m, fly: who, t: 0.45 });
    g.cash.coins = [];
    earn(v); floatText("+" + v, g.cash, "#ffd34d"); app.sfx("cash");
    return v;
  }
  let rateAcc = [];
  function earn(v) { app.addMoney(v); S.earned += v; rateAcc.push([performance.now(), v]); }

  /* ---------- предметы в руках (бельё 🧺 и шампанское 🍾) ---------- */
  const linenG = new THREE.BoxGeometry(0.42, 0.14, 0.32);
  function itemMesh(k) { if (k === "b") return bottle(); const m = new THREE.Mesh(linenG, mat("#f2f0ea")); return m; }
  function addHand(who, k) { const m = itemMesh(k); scene.add(m); who.hands.push({ k, m }); }
  function takeHand(who, k) { const i = who.hands.findIndex((h) => h.k === k); if (i < 0) return false; scene.remove(who.hands[i].m); who.hands.splice(i, 1); return true; }
  function drawHands(who) { let y = 1.15; for (const h of who.hands) { h.m.position.set(who.x + Math.sin(who.yaw) * 0.38, y, who.z + Math.cos(who.yaw) * 0.38); h.m.rotation.y = who.yaw; y += h.k === "b" ? 0.34 : 0.16; } }

  /* ---------- подсказки ---------- */
  const arrow = new THREE.Group();
  const ah = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.6, 4), new THREE.MeshBasicMaterial({ color: "#ffd34d" })); ah.rotation.x = Math.PI; arrow.add(ah);
  scene.add(arrow);
  function hintTarget() {
    const dirty = girls.find((g) => g.st === "dirty");
    if (dirty && !S.everClean && !lv("h_zina")) { if (!P.hands.some((h) => h.k === "l")) return { x: LAUNDRY.x, z: LAUNDRY.z, msg: "Номер грязный — возьми бельё в прачечной 🧺" }; return { x: dirty.x, z: dirty.z + 0.9, msg: `Отнеси бельё к ${dirty.def.n}` }; }
    if (!P.carry.length && !S.everServed && clients.some((c) => c.st === "wait")) return { x: QUEUE.x, z: QUEUE.z, msg: "Подойди к очереди и постой — клиенты пойдут за тобой" };
    if (P.carry.length && !S.everServed) { const g = girls.find((g) => g.st === "idle"); if (g) return { x: g.x, z: g.z + 0.9, msg: `Отведи клиента к ${g.def.n}` }; }
    const cg = girls.find((g) => g.cash.val > 0);
    if (!S.everCash && cg) return { x: cg.cash.x, z: cg.cash.z, msg: "Пройди по монетам — заберёшь выручку" };
    if (!S.everOffice && app.state.money >= 35) return { x: OFFICE.x, z: OFFICE.z, msg: "Зайди в Контору 📒 — там все улучшения" };
    if (P.carry.some((c) => c.type === "vip") && !girls.some((g) => g.bottle)) return { x: BAR.x, z: BAR.z, msg: "VIP 👑 идёт только к девушке с шампанским — возьми 🍾 в баре" };
    return null;
  }

  let peekDoor = -1, officeOpen = false, saveT = 0, hintMsg = "", spawnT = 1;
  const speed = () => 5.2 * (1 + 0.1 * lv("p_speed"));
  const leadCap = () => 2 + lv("p_lead");
  const handsCap = () => 2 + lv("p_hands");
  const serviceT = (g) => 4.6 * 0.86 ** lv("rooms") * 0.93 ** lv("g_" + g.def.id);

  /* ---------- шаг ---------- */
  function update(dt, input) {
    const sp = speed();
    P.vx = lerp(P.vx, input.x * sp, 1 - Math.exp(-dt * 14)); P.vz = lerp(P.vz, input.z * sp, 1 - Math.exp(-dt * 14));
    P.x += P.vx * dt; P.z += P.vz * dt; collide(P);
    const spd = Math.hypot(P.vx, P.vz);
    if (spd > 0.3) P.yaw = angLerp(P.yaw, Math.atan2(P.vx, P.vz), 1 - Math.exp(-dt * 14));
    P.still = spd < 0.6 ? P.still + dt : 0;
    player.root.position.set(P.x, 0, P.z); player.root.rotation.y = P.yaw;
    animPerson(player, dt, spd / sp, P.hands.length ? "carry" : P.carry.length ? "wave" : "idle");
    ringP.position.set(P.x, 0.03, P.z); pLight.position.set(P.x, 2.2, P.z + 0.3); pGlow.position.set(P.x, 0.025, P.z);
    drawHands(P);

    // поток клиентов
    spawnT -= dt;
    if (spawnT <= 0) { spawnClient(); spawnT = 4.4 * 0.85 ** lv("ads") * (0.75 + R() * 0.5); }
    clients.filter((c) => c.st === "wait" || c.st === "arrive").forEach((c, i) => { c.tx = QUEUE.x + 0.55 * i; c.tz = QUEUE.z + 0.42 * i; });

    // прачечная и бар производят сами
    const linMax = 4 + 2 * lv("laundry");
    if (linen < linMax) { linT += dt; if (linT >= 3.2 * 0.82 ** lv("laundry")) { linT = 0; linen++; } }
    tubs.forEach((b, i) => (b.visible = i < linen));
    if (S.un.bar) { const bm = 3 + lv("bar"); if (barStock < bm) { barT += dt; if (barT >= 3 * 0.82 ** lv("bar")) { barT = 0; barStock++; } } }
    barBottles.forEach((b, i) => (b.visible = i < barStock));

    // действия игрока (стоя на месте)
    if (P.still > 0.15) {
      P.act = (P.act || 0) - dt;
      if (P.act <= 0) {
        P.act = 0.2;
        if (Math.hypot(P.x - QUEUE.x - 0.5, P.z - QUEUE.z - 0.4) < 1.7 && P.carry.length < leadCap()) { const c = clients.find((c) => c.st === "wait"); if (c) { c.st = "follow"; c.leader = P; P.carry.push(c); app.sfx("pick"); app.haptic("light"); } }
        else if (Math.hypot(P.x - LAUNDRY.x, P.z - LAUNDRY.z) < 1.15 && linen > 0 && P.hands.length < handsCap()) { linen--; addHand(P, "l"); app.sfx("pick"); }
        else if (S.un.bar && Math.hypot(P.x - BAR.x, P.z - BAR.z) < 1.15 && barStock > 0 && P.hands.length < handsCap()) { barStock--; addHand(P, "b"); app.sfx("pick"); }
      }
      for (const g of girls) {
        if (Math.hypot(P.x - g.x, P.z - (g.z + 0.9)) > 1.05) continue;
        if (g.st === "dirty" && takeHand(P, "l")) { clean(g); S.everClean = 1; }
        if (!g.bottle && g.st !== "dirty" && P.hands.some((h) => h.k === "b") && (P.carry.some((c) => c.type === "vip") || !P.carry.length)) { takeHand(P, "b"); giveBottle(g); }
        if (g.st === "idle" && P.carry.length) {
          let c = P.carry.find((k) => k.type !== "vip" || g.bottle);
          if (!c) { if (!g.warn) { app.toast("VIP 👑 идёт только к девушке с шампанским 🍾"); g.warn = 2.5; } continue; }
          P.carry.splice(P.carry.indexOf(c), 1); assign(g, c);
        }
      }
    }
    girls.forEach((g) => { if (g.warn) g.warn = Math.max(0, g.warn - dt); });

    // Контора
    const inOffice = Math.hypot(P.x - OFFICE.x, P.z - OFFICE.z) < 1.15 && P.still > 0.3;
    if (inOffice !== officeOpen) { officeOpen = inOffice; app.office(inOffice); if (inOffice) S.everOffice = 1; }

    for (const id in helpers) stepHelper(helpers[id], dt);
    for (const c of clients) stepClient(c, dt);
    for (let i = clients.length - 1; i >= 0; i--) if (clients[i].st === "gone") { scene.remove(clients[i].p.root); clients.splice(i, 1); }
    for (const g of girls) stepGirl(g, dt);

    // выручку забирает тот, кто прошёл по монетам
    for (const g of girls) if (g.cash.val > 0 && Math.hypot(P.x - g.cash.x, P.z - g.cash.z) < 0.95) { takeCash(g, P); S.everCash = 1; app.haptic("light"); }

    // площадки открытий
    for (const id in pads) {
      const pd = pads[id];
      const on = Math.hypot(P.x - pd.pos.x, P.z - pd.pos.z) < 0.8 && spd < 2.5;
      pd.dwell = on ? pd.dwell + dt : 0;
      if (on && pd.dwell > 0.35 && app.state.money > 0) {
        const pay = Math.min(Math.max(30, pd.u.cost / 1.3) * dt, app.state.money, pd.u.cost - pd.paid);
        pd.paid += pay; app.addMoney(-pay, true); (S.padPaid ||= {})[id] = pd.paid; pd.r.setProg(pd.paid / pd.u.cost);
        if ((pd.tick = (pd.tick || 0) + dt) > 0.12) { pd.tick = 0; app.sfx("tick"); }
        if (pd.paid >= pd.u.cost - 0.01) { doUnlock(pd.u); break; }
      }
      if (pads[id]) { pd.g.children[1].position.y = 1.1 + Math.sin(performance.now() / 300) * 0.05; }
    }

    // «заглянуть» у занятой двери
    peekDoor = -1;
    for (const g of girls) if (g.st === "room" && Math.abs(P.x - g.x) < 1.0 && P.z < SPOT_Z + 2.2) peekDoor = g.slot;
    app.peek(peekDoor >= 0 ? girls.find((g) => g.slot === peekDoor) : null);

    doors.forEach((d, i) => {
      const g = girls.find((g) => g.slot === i), busy = g && g.st === "room";
      const gl = lerp(d.pl.material.opacity, busy ? 0.75 + Math.sin(performance.now() / 180) * 0.15 : g ? 0.18 : 0, 1 - Math.exp(-dt * 6));
      d.pl.material.opacity = gl; d.pool.material.opacity = gl * 0.8;
      d.lampM.color.set(busy ? "#ff2a3a" : g ? "#6a1a1a" : "#2a1010");
      d.open = lerp(d.open, (g && (g.st === "toRoom" || g.st === "out")) ? 1 : 0, 1 - Math.exp(-dt * 8));
      d.d.rotation.y = d.open * 1.2; d.d.position.x = d.x - Math.sin(d.open * 1.2) * 0.5;
    });

    stepWorld(dt);

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
    moon.position.set(cam.position.x - 8, 16, cam.position.z); moon.target.position.set(cam.position.x, 0, cam.position.z - 10);

    saveT += dt;
    if (saveT > 3) { saveT = 0; S.px = P.x; S.pz = P.z; S.linen = linen; S.barStock = barStock; S.dirty = Object.fromEntries(girls.filter((g) => g.st === "dirty").map((g) => [g.def.id, 1])); S.bottles = Object.fromEntries(girls.filter((g) => g.bottle).map((g) => [g.def.id, 1])); app.save(); }
    const now = performance.now(); rateAcc = rateAcc.filter((r) => now - r[0] < 60000);
    const autoN = ["h_gosha", "h_zina", "h_sema"].concat(S.un.bar ? ["h_pierre"] : []), autoOk = autoN.filter((id) => lv(id)).length;
    app.setProgress(Math.min(1, S.earned / T1_GOAL), `Этап 1 · заработано ${Math.floor(S.earned).toLocaleString("ru-RU")} / ${T1_GOAL.toLocaleString("ru-RU")}`);
    app.t1hud({ rate: rateAcc.reduce((s, r) => s + r[1], 0), auto: autoOk, autoN: autoN.length, linen, linMax, bar: S.un.bar ? barStock : -1 });
  }

  function stepWorld(dt) {
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i]; f.t -= dt;
      if (f.fly) { f.m.position.lerp(new THREE.Vector3(f.fly.x, 1.4, f.fly.z), 1 - Math.exp(-dt * 12)); f.m.scale.multiplyScalar(0.97); }
      else { f.vy -= f.txt ? 0 : 9 * dt; f.m.position.x += f.vx * dt; f.m.position.y += f.vy * dt; f.m.position.z += f.vz * dt; if (f.txt) f.m.material.opacity = Math.min(1, f.t * 2); }
      if (f.t <= 0) { scene.remove(f.m); fx.splice(i, 1); }
    }
    const rp = rainG.attributes.position.array;
    for (let i = 0; i < RAIN; i++) { const o = i * 6; rp[o + 1] -= 14 * dt; rp[o + 4] -= 14 * dt; if (rp[o + 4] < 0) { rp[o + 1] += 12; rp[o + 4] += 12; } }
    rainG.attributes.position.needsUpdate = true;
    if (neon.visible) { const fl = Math.random() < 0.02 ? 0.3 : 1; neon.material.opacity = fl; neonL.intensity = 10 * fl; }
    for (const p of passers) { p.x += p.dir * p.sp * dt; if (Math.abs(p.x) > 15) { p.x = -15 * p.dir; } p.p.root.position.set(p.x, 0, p.z); p.p.root.rotation.y = p.dir > 0 ? Math.PI / 2 : -Math.PI / 2; animPerson(p.p, dt, 0.45, "idle"); }
    tramT -= dt;
    if (tramT <= 0) { tramX += 9 * dt; tram.position.x = tramX; tramL.intensity = 4; if (tramX > 40) { tramX = -40; tramT = 22 + R() * 15; tramL.intensity = 0; } if (Math.abs(tramX) < 0.2) app.sfx("alarm"); }
  }

  function clean(g) { g.st = "idle"; app.sfx("ok"); floatText("✨", { x: g.x, z: g.z + 0.6 }, "#8fd8ff"); }
  function giveBottle(g) { g.bottle = true; app.sfx("ok"); }
  function assign(g, c) {
    g.st = "wait"; g.cl = c; g.res = null; c.st = "toGirl"; c.girl = g; c.tx = g.x + 0.45; c.tz = g.z + 0.5;
    if (c.type === "vip") g.bottle = false;
    app.sfx("ok"); app.haptic("medium");
  }
  function stepGirl(g, dt) {
    const p = g.p;
    g.need.visible = g.st === "dirty"; g.champ.visible = g.bottle;
    if (g.res && (g.st !== "idle" && g.st !== "dirty" || !g.res.target || g.res.target !== g)) g.res = null; // бронь не залипает
    if (g.st === "idle" || g.st === "dirty") { animPerson(p, dt, 0, g.st === "dirty" ? "idle" : "lean"); p.root.rotation.y = angLerp(p.root.rotation.y, Math.atan2(P.x - g.x, P.z - g.z) * 0.4, dt * 3); return; }
    if (g.st === "wait") { animPerson(p, dt, 0, "wave"); if (g.cl.st === "atGirl") { g.st = "toRoom"; g.t = 0; } return; }
    if (g.st === "toRoom") {
      g.t += dt; const k = Math.min(1, g.t / 0.9);
      p.root.position.z = lerp(SPOT_Z, WALL_Z + 0.2, k); p.root.rotation.y = Math.PI; animPerson(p, dt, 0.5, "idle");
      const c0 = g.cl; c0.x = lerp(c0.x, g.x + 0.2, k); c0.z = lerp(SPOT_Z + 0.5, WALL_Z + 0.3, k); c0.p.root.position.set(c0.x, 0, c0.z); c0.p.root.rotation.y = Math.PI; animPerson(c0.p, dt, 0.5, "idle");
      if (k >= 1) { g.st = "room"; g.t = 0; p.root.visible = false; c0.p.root.visible = false; g.dur = serviceT(g) * (c0.type === "vip" ? 1.4 : 1); }
      return;
    }
    if (g.st === "room") {
      g.t += dt;
      if (g.t >= g.dur) {
        g.st = "out"; g.t = 0; p.root.visible = true; g.cl.p.root.visible = true;
        const c = g.cl, match = CLIENTS[c.type].likes === g.def.t;
        const val = Math.round(BASE_PAY[c.type] * (match ? 1.5 : 1) * (1 + 0.25 * lv("g_" + g.def.id)));
        dropCash(g, val);
        floatText((match ? "❤️ " : "") + "+" + val, { x: g.x, z: g.z + 1 }, match ? "#ff8fc7" : "#7ed957");
        g.served++; S.served[g.def.id] = g.served; S.everServed = 1;
        if (g.served === 8) app.unlockScene(`SC18-T1-${g.def.id.toUpperCase()}-2`, `${g.def.n}: новая сцена в альбоме`);
        if (c.type === "vip") app.unlockScene("SC18-T1-VIP", "VIP-номер: сцена в альбоме");
        c.st = "leave"; c.tx = -1 + R() * 4; c.tz = 13;
        c.p.root.remove(c.bub);
        const h = label(match ? "😍" : "🙂", { fs: 50, size: 0.4, bg: false }); h.position.y = 2.2; c.p.root.add(h);
      }
      return;
    }
    if (g.st === "out") {
      g.t += dt; const k = Math.min(1, g.t / 0.8);
      p.root.position.z = lerp(WALL_Z + 0.2, SPOT_Z, k); p.root.rotation.y = 0; animPerson(p, dt, 0.5, "idle");
      if (k >= 1) { g.st = "dirty"; g.cl = null; }
    }
  }
  function stepClient(c, dt) {
    let tx = c.tx, tz = c.tz, sp = c.sp;
    if (c.st === "follow") {
      const L = c.leader, arr = L.carry, i = arr.indexOf(c);
      if (i < 0) { c.st = "wait"; return; }
      const ahead = i === 0 ? { x: L.x, z: L.z } : { x: arr[i - 1].x, z: arr[i - 1].z };
      const d = Math.hypot(ahead.x - c.x, ahead.z - c.z);
      if (d > 0.85) { tx = ahead.x; tz = ahead.z; sp = Math.max(3, d * 4.5); } else { tx = c.x; tz = c.z; }
    }
    if (c.st === "atGirl") return;
    const dx = tx - c.x, dz = tz - c.z, d = Math.hypot(dx, dz);
    let moving = 0;
    if (d > 0.05) { const st = Math.min(d, sp * dt); c.x += (dx / d) * st; c.z += (dz / d) * st; moving = st / dt / 4; c.p.root.rotation.y = angLerp(c.p.root.rotation.y, Math.atan2(dx, dz), 1 - Math.exp(-dt * 10)); }
    c.p.root.position.set(c.x, 0, c.z);
    animPerson(c.p, dt, moving, "idle");
    if (c.st === "arrive" && d < 0.1) c.st = "wait";
    if (c.st === "wait") {
      c.p.root.rotation.y = angLerp(c.p.root.rotation.y, -Math.PI * 0.75, dt * 4);
      c.pat -= dt;
      if (c.pat < 8) c.bub.material.opacity = 0.5 + 0.5 * Math.abs(Math.sin(performance.now() / 150));
      if (c.pat <= 0) { c.st = "leave"; c.tx = 6.5; c.tz = 13; app.lost(); const h = label("😤", { fs: 50, size: 0.4, bg: false }); h.position.y = 2.6; c.p.root.add(h); }
    }
    if (c.st === "toGirl" && d < 0.12) { c.st = "atGirl"; c.p.root.rotation.y = Math.PI; }
    if (c.st === "leave" && c.z > 12.5) c.st = "gone";
  }

  /* ---------- помощники: каждый тик заново решает, что делать; брони сами снимаются ---------- */
  function moveTo(H, tx, tz, sp, dt) {
    const dx = tx - H.x, dz = tz - H.z, d = Math.hypot(dx, dz);
    if (d > 0.06) { const st = Math.min(d, sp * dt); H.x += (dx / d) * st; H.z += (dz / d) * st; H.yaw = angLerp(H.yaw, Math.atan2(dx, dz), 1 - Math.exp(-dt * 10)); collide(H); }
    H.p.root.position.set(H.x, 0, H.z); H.p.root.rotation.y = H.yaw;
    animPerson(H.p, dt, d > 0.06 ? 0.8 : 0, H.hands.length ? "carry" : H.carry.length ? "wave" : "idle");
    drawHands(H);
    return d < 0.25;
  }
  function claim(H, g) { if (H.target && H.target !== g && H.target.res === H) H.target.res = null; H.target = g; if (g) g.res = H; }
  function stepHelper(H, dt) {
    const L = lv(H.id), sp = hSpeed(L), cap = L;
    const home = H.d.home;
    if (H.id === "h_gosha") {
      if (!H.carry.length) {
        const free = girls.filter((g) => g.st === "idle" && (!g.res || g.res === H));
        const q = clients.filter((c) => c.st === "wait" && (c.type !== "vip" || free.some((g) => g.bottle)));
        if (q.length && free.length) { if (moveTo(H, QUEUE.x - 0.7, QUEUE.z + 0.2, sp, dt)) { for (const c of q) { if (H.carry.length >= Math.min(cap, free.length)) break; c.st = "follow"; c.leader = H; H.carry.push(c); } } return; }
        claim(H, null); moveTo(H, home.x, home.z, sp, dt); return;
      }
      const c = H.carry[0];
      let g = H.target && H.target.st === "idle" && H.target.res === H && (c.type !== "vip" || H.target.bottle) ? H.target : girls.find((g) => g.st === "idle" && !g.res && (c.type !== "vip" || g.bottle));
      if (!g) { claim(H, null); moveTo(H, H.x, H.z, sp, dt); return; }
      claim(H, g);
      if (moveTo(H, g.x + 0.8, g.z + 1.0, sp, dt)) { H.carry.shift(); claim(H, null); assign(g, c); }
      return;
    }
    if (H.id === "h_zina") {
      const dirty = girls.filter((g) => g.st === "dirty" && (!g.res || g.res === H));
      if (!H.hands.length) {
        if (dirty.length && linen > 0) { if (moveTo(H, LAUNDRY.x + 0.3, LAUNDRY.z + 0.5, sp, dt)) { const n = Math.min(cap, dirty.length, linen); for (let i = 0; i < n; i++) { linen--; addHand(H, "l"); } } return; }
        claim(H, null); moveTo(H, home.x, home.z, sp, dt); return;
      }
      const g = H.target && H.target.st === "dirty" && H.target.res === H ? H.target : dirty.find((g) => !g.res);
      if (!g) { claim(H, null); moveTo(H, home.x, home.z, sp, dt); return; }
      claim(H, g);
      if (moveTo(H, g.x - 0.6, g.z + 0.9, sp, dt)) { takeHand(H, "l"); claim(H, null); clean(g); }
      return;
    }
    if (H.id === "h_pierre") {
      const need = girls.filter((g) => !g.bottle && g.st !== "dirty" && (!g.res || g.res === H));
      if (!H.hands.length) {
        if (need.length && barStock > 0) { if (moveTo(H, BAR.x + 0.3, BAR.z - 0.5, sp, dt)) { const n = Math.min(cap, need.length, barStock); for (let i = 0; i < n; i++) { barStock--; addHand(H, "b"); } } return; }
        claim(H, null); moveTo(H, home.x, home.z, sp, dt); return;
      }
      const g = H.target && !H.target.bottle && H.target.res === H ? H.target : girls.find((g) => !g.bottle && !g.res);
      if (!g) { claim(H, null); moveTo(H, home.x, home.z, sp, dt); return; }
      claim(H, g);
      if (moveTo(H, g.x + 0.6, g.z + 0.9, sp, dt)) { takeHand(H, "b"); claim(H, null); giveBottle(g); }
      return;
    }
    if (H.id === "h_sema") {
      const g = girls.filter((g) => g.cash.val >= 10).sort((a, b) => b.cash.val - a.cash.val)[0];
      if (!g) { moveTo(H, home.x, home.z, sp, dt); return; }
      if (moveTo(H, g.cash.x, g.cash.z + 0.2, sp, dt)) takeCash(g, H);
    }
  }
  const OB = [
    { x: LAUNDRY.x - 1.35, z: LAUNDRY.z, rx: 0.45, rz: 1.2 }, { x: BAR.x - 1.35, z: BAR.z, rx: 0.45, rz: 1.2 }, { x: OFFICE.x + 1.35, z: OFFICE.z, rx: 0.45, rz: 1.2 },
    { x: bench.position.x, z: bench.position.z, rx: 1.4, rz: 0.45 },
  ];
  function collide(o) {
    o.x = clamp(o.x, BOUNDS.x0, BOUNDS.x1); o.z = clamp(o.z, BOUNDS.z0, BOUNDS.z1);
    for (const b of OB) { const dx = o.x - b.x, dz = o.z - b.z, px = b.rx + 0.3 - Math.abs(dx), pz = b.rz + 0.3 - Math.abs(dz); if (px > 0 && pz > 0) { if (px < pz) o.x += Math.sign(dx) * px; else o.z += Math.sign(dz) * pz; } }
  }

  // доход, пока игры не было (только если наняты помощники): Гоша+Сёма — половина обычного темпа, до 2 часов
  if (S.leftAt && lv("h_gosha") && lv("h_sema")) {
    const away = Math.min(7200, (Date.now() - S.leftAt) / 1000);
    if (away > 60) { const per = girls.length * 11 * (lv("h_zina") ? 1 : 0.4) / (serviceT(girls[0]) + 2.5); const got = Math.round(away * per * 0.5); if (got > 0) setTimeout(() => { earn(got); app.toast(`Пока тебя не было, помощники заработали +${got}`); }, 800); }
  }
  addEventListener("pagehide", () => { S.leftAt = Date.now(); app.save(); });
  document.addEventListener("visibilitychange", () => { if (document.hidden) { S.leftAt = Date.now(); app.save(); } });

  cam.position.set(clamp(P.x, -1.6, 1.8), 22, clamp(P.z, 0.5, 4.6) + 8.8);
  return {
    scene, cam, clients, girls, P, helpers, pads, buyUpg, lv,
    update,
    render() { renderer.render(scene, cam); },
    resize() { resize(cam); },
    peekGirl() { return girls.find((g) => g.slot === peekDoor); },
    dispose() { scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); },
  };
}
