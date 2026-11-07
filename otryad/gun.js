// «Отряд» — режим «Пушка»: отрисовка и управление поверх чистой логики gun-sim.js
// v2: пушка на рельсе, ящики с наградами, растущие ворота, «5→1 громила», чемпион, лучники красных.
import { THREE, Units, Crowd, Debris, Particles, Labels, redrawText, buildScenery, fenceLine, placeModels, makeGate, makeCannonModel, makeBanner, cloneModel, pbr, boxUV, disposeGroup, clamp, lerp, BIOMES, BIOME_ORDER } from "./core.js";
import { GunSim, CFG, levelInfo, NEWS } from "./gun-sim.js";
import { makeBot } from "./gun-bot.js";
import { play } from "./audio.js";

const T = window.TG;
const RED = 0xe5393b, GOLD = 0xffc62b;
const M = {};
function mat(key, color, o) { if (!M[key]) { M[key] = new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.6, metalness: 0.1 }, o || {})); M[key].userData.keep = 1; } return M[key]; }
const growBar = (g) => { if (g.N >= CFG.gate.growMax) return "МАКС"; const k = Math.min(5, Math.floor(g.acc / (CFG.gate.growNeed * g.N) * 6)); return "▮".repeat(k) + "▯".repeat(5 - k); };
const gateText = (g) => g.k === "x" ? "×" + g.N + (g.grow ? "↑\n" + growBar(g) : "") : g.k === "+" ? "+" + Math.floor(g.pool) : g.k === "-" ? "−" + Math.ceil(g.pool) : g.k === "M" ? g.N + "→1\nгромила" : g.broken ? "" : String(Math.ceil(g.pool));
export const GIVE_TXT = { rapid: "⚡ Скорострельность", barrel: "➕ Ствол", champ: "🦸 Чемпион", gate: "✨ Ворота +1", brutes: "💪 Громилы", heal: "🔧 Починка" };
const SOL_T = { basic: 0, brute: 1, champ: 2 }, EN_T = { grunt: 0, runner: 1, tank: 2, archer: 3, giant: 4 };

export class Gun {
  constructor(eng, hud, labelsRoot) {
    this.eng = eng; this.hud = hud;
    this.labels = new Labels(labelsRoot, eng.camera);
    this.debris = new Debris(eng, 300);
    this.parts = new Particles(eng);
    eng.scene.add(this.debris.group);
    this.auto = null; this.speedUp = 1;
  }
  load(n, up, look) {
    this.dispose();
    const eng = this.eng;
    this.n = n; this.up = up; this.look = look;
    this.sim = new GunSim(n, up, 9000 + n * 13 + Math.floor(Math.random() * 1000));
    this.info = levelInfo(n);
    const biome = BIOME_ORDER[Math.floor((n - 1) / 5) % BIOME_ORDER.length];
    eng.setBiome(biome); this.B = BIOMES[biome];
    this.world = new THREE.Group(); eng.scene.add(this.world);
    this.buildField();
    // наши: обычные (рыцарь), громилы (варвар), чемпион (рыцарь с двуручником, золотой), щитоносцы
    this.S = new Crowd(eng, CFG.soldier.maxAlive + 40, look.color, look.hat, false, [
      { kind: "blue" }, { kind: "brute", hat: "none", cap: 120, capK: 0.5 }, { kind: "knight2", hat: "crown", color: GOLD, cap: 8, capK: 0.2, nearCap: 8, lod: 3 }, { kind: "shield", cap: 300, capK: 0.6 }]);
    this.world.add(this.S.mesh); this.S.lodScale = 1.5;
    // красные: пехота, бегуны, щиты, лучники, великаны
    this.E = new Crowd(eng, 760, RED, "none", true, [
      { kind: "blue" }, { kind: "scout", cap: 300, capK: 0.6 }, { kind: "shield", cap: 140, capK: 0.5 }, { kind: "archer", cap: 80, capK: 0.4 }, { kind: "brute", cap: 24, capK: 0.3, nearCap: 24, lod: 3 }]);
    this.world.add(this.E.mesh); this.E.lodScale = 1.5;
    this.EB = new Units(eng, 2, 0xb3272a, "horns", "boss"); this.world.add(this.EB.mesh);
    this.debris.setTeam(look.color);
    this.arrowM = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 4).rotateX(Math.PI / 2), mat("arrow", 0x5a3a20), 80); this.arrowM.frustumCulled = false; this.arrowM.count = 0; this.world.add(this.arrowM);
    this.phase = "intro"; this.t = 0; this.firing = false; this.evT = {}; this.result = null; this.lastHp = this.sim.hp;
    this.tut = 0; this.slowT = 0; this.newsShown = false;
    this.camera(1);
    this.hud.hp(1); this.hud.heat(0, false); this.hud.wave(0, this.sim.lv.waves.length); this.hud.charge && this.hud.charge(0, false, this.sim.champOn);
  }
  dispose() {
    if (!this.world) return;
    this.labels.clear(); this.debris.clear(); this.parts.clear();
    [this.S, this.E, this.EB].forEach((u) => u && u.dispose());
    disposeGroup(this.world); this.world = null;
  }
  buildField() {
    const w = this.world, B = this.B, F = CFG.field, hw = F.hw, bid = this.eng.biomeId;
    // поле: мощёная площадка на скале, заборы по бокам
    const L = F.len + 10;
    const ground = new THREE.Mesh(boxUV(new THREE.BoxGeometry(hw * 2, 0.8, L), hw * 2, 0.8, L, 3), pbr(B.road, { roughness: 0.85 })); ground.position.set(0, -0.4, -(F.len / 2 + 1)); ground.receiveShadow = true; w.add(ground);
    const cliff = new THREE.Mesh(boxUV(new THREE.BoxGeometry(hw * 2 + 0.4, 9, L), hw * 2 + 0.4, 9, L, 5), pbr(B.cliff, { roughness: 0.95 })); cliff.position.set(0, -5.3, -(F.len / 2 + 1)); cliff.receiveShadow = true; w.add(cliff);
    for (const sd of [-1, 1]) fenceLine(w, bid, sd * (hw + 0.12), 4, -(F.len + 4), 0);
    // линия обороны
    const line = new THREE.Mesh(new THREE.BoxGeometry(hw * 2, 0.03, 0.22), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff3a3a).multiplyScalar(1.6), toneMapped: false })); line.position.set(0, 0.02, -F.baseZ); w.add(line);
    // рельс, по которому ездит пушка: две полосы железа на шпалах
    const iron = mat("iron", 0x4a4e56, { metalness: 0.8, roughness: 0.35 }), wood = pbr("planks", { roughness: 0.8 });
    const RL = CFG.cannon.rail * 2 + 2.4;
    for (const z of [0.0, 0.85]) { const r = new THREE.Mesh(new THREE.BoxGeometry(RL, 0.12, 0.12), iron); r.position.set(0, 0.08, z); r.castShadow = true; r.receiveShadow = true; w.add(r); }
    const sl = new THREE.InstancedMesh(new THREE.BoxGeometry(0.28, 0.06, 1.4), wood, 16); let si = 0; const m4 = new THREE.Matrix4();
    for (let x = -RL / 2 + 0.3; x < RL / 2 && si < 16; x += RL / 15) sl.setMatrixAt(si++, m4.makeTranslation(x, 0.03, 0.42)); sl.count = si; sl.receiveShadow = true; w.add(sl);
    for (const sd of [-1, 1]) { const stop = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.45, 1.2), mat("warnG", 0xffc21a)); stop.position.set(sd * (RL / 2), 0.22, 0.42); w.add(stop); }
    placeModels(w, "Barrel", [[-hw - 0.7, 0, 1.6, 1, 0.5], [hw + 0.7, 0, 1.8, 1, 2]], { shadow: true });
    for (const sd of [-1, 1]) { const bn = makeBanner(B.banner); bn.position.set(sd * (hw + 0.8), 0, -2.5); bn.rotation.y = sd > 0 ? -Math.PI / 2 : Math.PI / 2; bn.scale.setScalar(1.3); w.add(bn); }
    // вражеская крепость вдали: стена, ворота, башни (KayKit, перекрашены в красный)
    const fort = new THREE.Group(); fort.position.z = -(F.spawnZ + 3.5); w.add(fort);
    for (const sd of [-1, 1]) {
      const wl = cloneModel("wall_straight", { hue: 0.4 }); wl.scale.setScalar(2.4); wl.position.set(sd * 3.9, 0, 0); fort.add(wl);
      const tw = cloneModel("building_tower_A_blue", { hue: 0.4 }); tw.scale.setScalar(3.2); tw.position.set(sd * (hw + 0.6), 0, 0.3); fort.add(tw);
      const bn = makeBanner(0xc0392b); bn.position.set(sd * 1.7, 0, 1.4); bn.scale.setScalar(1.5); fort.add(bn);
    }
    // пушка на тележке
    const cn = new THREE.Group(); w.add(cn);
    const model = makeCannonModel({ gold: this.sim.barrels > 1 }); cn.add(model);
    cn.position.set(0, 0.12, 0.4);
    this.cannon = cn; this.cmodel = model; this.barrel = model.userData.pitch; this.body = model.userData.barrel;
    this.hotMat = model.userData.barrel.material.clone(); this.hotMat.userData.keep = 0; model.userData.barrel.material = this.hotMat;
    this.barrel.rotation.x = 0.12; this.shownBarrels = 0;
    // линия прицела
    const lg = new THREE.BufferGeometry(); lg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(6), 3));
    this.aimLine = new THREE.Line(lg, new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 0.5, gapSize: 0.35, transparent: true, opacity: 0.75 }));
    w.add(this.aimLine);
    // ворота
    this.gateM = [];
    for (const r of this.sim.rows) for (const gt of r.gates) {
      const gg = new THREE.Group(); gg.position.z = -r.z; w.add(gg);
      const W = gt.w;
      if (gt.k === "#") {
        const wall = new THREE.Mesh(boxUV(new THREE.BoxGeometry(W - 0.1, 1.5, 0.5), W - 0.1, 1.5, 0.5, 1.2), wood); wall.position.y = 0.75; wall.castShadow = true; gg.add(wall);
        for (const sx of [-1, 1]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.9, 0.6), iron); post.position.set(sx * (W / 2 - 0.1), 0.95, 0); post.castShadow = true; gg.add(post); }
        for (let i = 0; i < 2; i++) { const band = new THREE.Mesh(new THREE.BoxGeometry(W - 0.05, 0.1, 0.55), iron); band.position.y = 0.35 + i * 0.8; gg.add(band); }
        const G = makeGate(1.7, gateText(gt), "bad", 0.1); const lab = G.lab; lab.position.set(0, 1.95, 0.1); gg.add(lab);
        gg.rotation.x = -0.25;
        this.gateM.push({ gt, gg, tex: G.tex, wall, txt: gateText(gt), shield: 1 });
        continue;
      }
      const kind = gt.k === "M" ? "unit" : gt.grow ? "gold" : gt.k === "x" ? "mult" : gt.k === "+" ? "plus" : "bad";
      const G = makeGate(W, gateText(gt), kind, 2.2);
      gg.add(G.g);
      gg.rotation.x = -0.3;
      this.gateM.push({ gt, gg, tex: G.tex, pm: G.pm, txt: gateText(gt) });
    }
    // ящики с наградами (большой ящик с числом и значком награды)
    this.crateM = [];
    for (const c of this.sim.crates) {
      const g = new THREE.Group(); g.position.set(c.x, 0, -c.z); w.add(g);
      const box = cloneModel("Crate_Wooden"); box.scale.setScalar(2.3); g.add(box);
      const ring = new THREE.Mesh(new THREE.RingGeometry(1.15, 1.4, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd34a).multiplyScalar(1.5), transparent: true, opacity: 0.85, toneMapped: false })); ring.position.y = 0.04; g.add(ring);
      const lb = this.labels.add("crate", ""); lb.el.innerHTML = "<b></b><small></small>"; lb.x = c.x; lb.y = 2.6; lb.z = -c.z;
      this.crateM.push({ c, g, box, ring, lb, hp: -1, give: "" });
    }
    this.towerM = [];
    buildScenery(w, bid, 14, -(F.len + 40), { inner: hw + 1, seed: this.n * 31 + 7 });
  }
  // ---------- ввод ----------
  // палец ведёт пушку по рельсу (как в лучших играх жанра): смещение пальца → смещение пушки
  aimDrag(dxPx, W) { this.sim.tx = clamp(this.sim.tx + dxPx / W * CFG.cannon.rail * 2.6, -CFG.cannon.rail, CFG.cannon.rail); this.dragged = true; }
  setFiring(on) { this.firing = on; if (on && this.phase === "intro") this.start(); }
  start() { if (this.phase !== "intro") return; this.phase = "play"; play("gong", { vol: 0.6 }); }
  setAuto(kind) { this.auto = kind ? makeBot(kind, 3) : null; }
  launchChamp() { if (this.phase !== "play") return false; const ok = this.sim.launchChamp(); if (!ok) play("error", { vol: 0.5 }); return ok; }
  // ---------- кадр ----------
  update(rdt) {
    if (!this.world) return;
    const sim = this.sim;
    if (this.slowT > 0) this.slowT -= rdt;
    const dt = Math.min(rdt, 1 / 30) * (this.slowT > 0 ? 0.35 : 1);
    if (this.phase === "play") {
      const steps = this.speedUp;
      for (let s = 0; s < steps; s++) {
        if (this.auto) this.auto(sim, dt); else sim.firing = this.firing;
        sim.step(dt);
        this.handleEvents();
        if (sim.state !== "play") break;
      }
      this.t += dt;
      if (sim.state !== "play" && !this.result) this.finish();
      this.tutorial();
    }
    this.render(rdt, dt);
  }
  tutorial() {
    const H = this.hud, sim = this.sim;
    if (this.n === 1) {
      if (this.tut === 0) { this.tut = 1; H.hint("👆 Веди пальцем — пушка едет, держи — стреляй", "drag"); }
      if (this.tut === 1 && sim.fired > 8) { this.tut = 2; H.hint("Встань под «×2» — бойцов станет вдвое больше!", "gate"); setTimeout(() => this.tut === 2 && H.hint(null), 3500); }
      if (this.tut === 2 && sim.locked) { this.tut = 3; H.hint("Перегрев! Отпусти палец — ствол остынет", "heat"); setTimeout(() => H.hint(null), 2600); }
      return;
    }
    // новинка уровня — короткая подсказка в начале
    if (!this.newsShown && this.info.news && sim.t > 0.6) {
      this.newsShown = true; H.hint(NEWS[this.info.news], "new"); setTimeout(() => H.hint(null), 3600);
    }
    if (this.info.news === "champ" && this.tut === 0 && sim.charged) { this.tut = 1; H.hint("Полоса заполнена — жми «Чемпион»!", "champ"); setTimeout(() => H.hint(null), 3000); }
  }
  handleEvents() {
    const sim = this.sim, now = this.t, gap = (k, g) => { if (now - (this.evT[k] || -9) < g) return false; this.evT[k] = now; return true; };
    for (const e of sim.ev) {
      switch (e.t) {
        case "shot": if (gap("shot", 0.07)) play("xbow", { vol: 0.55, gap: 0.06 }); this.recoil = 1; if (gap("hshot", 0.12)) T.haptic("impact", "light"); if (gap("muz", 0.1)) this.parts.fx.muzzle(sim.x, 1.8, -2.0, 0, -1); if (e.brute && gap("br", 0.3)) play("heavy", { vol: 0.35, rate: 1.4 }); break;
        case "gate": {
          const gm = this.gateM.find((m) => m.gt === e.g); if (gm) gm.pop = 1;
          if (e.k === "x") { if (gap("gx", 0.09)) play("coin2", { vol: 0.45, rate: 1 + Math.min(0.6, e.g.N * 0.12), gap: 0.08 }); this.parts.burst(e.x, 1.2, -e.z, 2, e.g.grow ? 0xffd34a : 0x7cc8ff, 3, 0.12, 2, 6); }
          else if (e.k === "+") { if (gap("gp", 0.1)) play("coin", { vol: 0.4, gap: 0.09 }); this.parts.burst(e.x, 1.2, -e.z, 2, 0x7dff9a, 3, 0.12, 2, 6); }
          else if (e.k === "M") { if (gap("gmm", 0.1)) play("select", { vol: 0.35, rate: 0.8 + e.g.acc * 0.15, vary: false }); this.parts.burst(e.x, 1.2, -e.z, 2, 0x19c9c0, 3, 0.12, 2, 6); }
          else { if (gap("gm", 0.12)) play("error", { vol: 0.35, gap: 0.1 }); this.parts.burst(e.x, 1, -e.z, 3, this.look.color, 3, 0.12, 2); }
          break;
        }
        case "grow": play("levelup", { vol: 0.6 }); { const gm = this.gateM.find((m) => m.gt === e.g); if (gm) { gm.pop = 1.6; this.parts.sparkle(gm.gg.position.x, 2.4, gm.gg.position.z, 0xffd34a, 18); } } this.hud.float("×" + e.g.N, "gold"); break;
        case "merge": play("heavy", { vol: 0.55 }); this.parts.ring(e.x, -e.z, 0.3, 2.2, 0.4, 0x19c9c0, 0.1); this.parts.burst(e.x, 1.2, -e.z, 8, 0x19c9c0, 4, 0.15, 3); break;
        case "smash": if (gap("sm", 0.1)) play("stonehit", { vol: 0.55, gap: 0.08 }); this.parts.burst(e.x, 1, -e.z, 6, 0xc89a5a, 5, 0.18, 4); this.eng.shake(0.12); { const gm = this.gateM.find((m) => m.gt === e.g); if (gm) gm.pop = 1; } break;
        case "shield": if (gap("sh", 0.08)) play("stonehit", { vol: 0.45, gap: 0.07 }); this.parts.burst(e.x, 0.9, -e.z, 3, 0xc89a5a, 3, 0.12, 2); { const gm = this.gateM.find((m) => m.gt === e.g); if (gm) gm.pop = 1; } break;
        case "shield_break": play("collapse", { vol: 0.6 }); this.eng.shake(0.25); { const gm = this.gateM.find((m) => m.gt === e.g); if (gm) this.parts.burst(gm.gg.position.x, 0.8, gm.gg.position.z, 14, 0x8a5a2e, 6, 0.25, 5); } break;
        case "shield_up": play("confirm", { vol: 0.3 }); break;
        case "crate_hit": { const cm = this.crateM.find((m) => m.c === e.c); if (cm) cm.pop = 1; if (gap("ch", 0.07)) play("househit", { vol: 0.35, gap: 0.06, rate: 1.2 }); if (Math.random() < 0.5) this.parts.burst(e.x, 1.2, -e.z, 2, 0xc89a5a, 3, 0.12, 2); break; }
        case "crate_pop": {
          play("perk", { vol: 0.75 }); play("collapse", { vol: 0.4, rate: 1.4 }); this.eng.shake(0.35); T.haptic("notify", "success");
          this.parts.burst(e.x, 1.4, -e.z, 26, 0x9a6a3a, 7, 0.24, 6); this.parts.sparkle(e.x, 2, -e.z, 0xffd34a, 30); this.parts.ring(e.x, -e.z, 0.4, 4, 0.5, 0xffd34a, 0.1);
          this.hud.toast(GIVE_TXT[e.kind] || "Награда!");
          break;
        }
        case "crate_up": play("open", { vol: 0.4 }); break;
        case "rapid_end": play("close", { vol: 0.4 }); break;
        case "champ": play("roar2", { vol: 0.7, rate: 1.3 }); play("gong", { vol: 0.5 }); this.eng.shake(0.5); T.haptic("impact", "heavy"); this.parts.ring(e.x, -e.z, 0.5, 3.5, 0.5, 0xffd34a, 0.1); this.hud.toast("Чемпион!"); break;
        case "charged": play("levelup", { vol: 0.6 }); T.haptic("notify", "success"); break;
        case "clash": if (gap("cl", 0.06)) play(Math.random() < 0.5 ? "hit" : "hit2", { vol: 0.4, gap: 0.05 }); if (Math.random() < 0.4) this.parts.sparks(e.x, 0.7, -e.z, 2); if (e.big && gap("bigc", 0.12)) { play("heavy", { vol: 0.35, rate: 1.3 }); this.parts.dust(e.x, -e.z, 3, 0.5); } else if (Math.random() < 0.12) this.debris.add(e.x, 0.4, -e.z, (Math.random() - 0.5) * 5, 5, 2 + Math.random() * 3, this.look.color, Math.PI, 0); break;
        case "kill": {
          const big = e.type === "giant" || e.type === "boss" || e.type === "tank";
          if (big || Math.random() < 0.35) this.debris.add(e.x, 0.3, -e.z, (Math.random() - 0.5) * 6, 5 + Math.random() * 4, -3 - Math.random() * 4, RED, 0, 0);
          else this.parts.burst(e.x, 0.5, -e.z, 3, RED, 4, 0.14, 3);
          if (big) { play(e.type === "tank" ? "stonehit" : "collapse", { vol: 0.7 }); this.eng.shake(e.type === "tank" ? 0.15 : 0.5); this.parts.sparks(e.x, 1, -e.z, 14); this.parts.dust(e.x, -e.z, e.type === "tank" ? 6 : 14, e.type === "tank" ? 0.5 : 1); T.haptic("impact", "medium"); }
          else if (gap("kill", 0.1)) play("bone", { vol: 0.3, gap: 0.08 });
          break;
        }
        case "bossdie": this.slowT = 1.0; this.eng.shake(1); play("roar", { vol: 0.8, rate: 0.7 }); T.haptic("notify", "success"); this.hud.toast("Великан повержен!"); break;
        case "base": play(e.type === "arrow" ? "hurt" : "heavy", { vol: e.type === "arrow" ? 0.5 : 0.8, gap: 0.08 }); this.eng.shake(e.type === "arrow" ? 0.1 : 0.25 + Math.min(0.6, e.dmg * 0.08)); T.haptic("impact", e.type === "arrow" ? "light" : "heavy"); if (e.type !== "arrow") this.parts.explosion(e.x, -1.2, 0.8 + Math.min(1.5, e.dmg * 0.15)); else this.parts.sparks(e.x, 1.2, -0.4, 6); this.hud.hurt(); break;
        case "arrow_fire": if (gap("af", 0.15)) play("arrow", { vol: 0.35, gap: 0.12 }); break;
        case "archers": if (gap("arch", 3)) this.hud.toast("Лучники! Гаси их первыми"); break;
        case "wave": play("gong", { vol: 0.55 }); this.hud.wave(e.i, e.n); if (now - (this.evT.arch || -9) > 0.5) this.hud.toast(e.i === e.n ? "Последняя волна!" : `Волна ${e.i} из ${e.n}`); break;
        case "boss": play("roar2", { vol: 0.9 }); this.hud.toast("Идёт великан!"); this.eng.shake(0.5); T.haptic("notify", "warning"); break;
        case "tower": play("bell", { vol: 0.5 }); this.hud.toast("Казармы! Разбей башни"); break;
        case "tdie": play("collapse", { vol: 0.9 }); this.eng.shake(0.6); this.parts.burst(e.x, 2, -e.z, 20, 0x8d8a86, 7, 0.35, 6); this.parts.explosion(e.x, -e.z, 2.2); T.haptic("impact", "heavy"); break;
        case "tspawn": case "bspawn": if (gap("sp", 0.3)) play("open", { vol: 0.3 }); break;
        case "overheat": play("error", { vol: 0.8 }); this.hud.toast("Перегрев!"); T.haptic("notify", "error"); break;
        case "cooled": play("confirm", { vol: 0.4 }); break;
      }
    }
    sim.ev.length = 0;
  }
  finish() {
    const sim = this.sim, win = sim.state === "win";
    this.phase = "done";
    const stars = sim.stars(), coins = Math.round(sim.coins());
    this.result = { win, stars, coins, hp: sim.hp, maxHp: sim.maxHp, kills: sim.killed, made: sim.made, fired: sim.fired, champs: sim.champs, crates: sim.cratesPopped };
    if (win) { play("perk", { vol: 0.8 }); T.haptic("notify", "success"); this.hud.toast("Победа!"); for (let k = 0; k < 4; k++) setTimeout(() => this.parts && this.parts.burst((Math.random() - 0.5) * 8, 6, -14 - Math.random() * 10, 30, [0xffd34a, 0x5ac8ff, 0xff6ad5, 0x7dff8a][k], 7, 0.16, 8, 9), k * 220); }
    else { play("die2", { vol: 0.8 }); T.haptic("notify", "error"); this.hud.toast("Пушку сломали!"); this.eng.shake(0.8); this.parts.burst(sim.x, 1.2, 0, 40, 0x3a3f4a, 8, 0.3, 7); }
    setTimeout(() => this.hud.end(this.result), 1100);
  }
  camera(dt) {
    const cam = this.eng.camera, a = this.eng.W / this.eng.H;
    const fov = a < 0.75 ? 70 : 58;
    if (cam.fov !== fov) { cam.fov = fov; cam.updateProjectionMatrix(); }
    cam.position.set(0, 19, 7);
    cam.lookAt(0, 0, -15);
  }
  render(rdt, dt) {
    const sim = this.sim, F = CFG.field;
    this.camera(rdt);
    // пушка: едет по рельсу, чуть кренится на ходу, колёса крутятся
    this.cannon.position.x = sim.x;
    this.cmodel.rotation.y = -clamp(sim.vx * 0.015, -0.18, 0.18);
    for (const wh of this.cmodel.userData.wheels) wh.rotation.x -= sim.vx * rdt / 0.62;
    const nb = sim.barrelsNow; if (nb !== this.shownBarrels) { if (this.shownBarrels && nb > this.shownBarrels) { play("upgrade", { vol: 0.7 }); this.parts.sparkle(sim.x, 2, 0, 0xffd34a, 24); } this.shownBarrels = nb; this.cmodel.userData.setBarrels(nb); }
    this.recoil = Math.max(0, (this.recoil || 0) - rdt * 8);
    this.barrel.position.z = this.recoil * 0.3; this.barrel.position.y = 1.45;
    const hf = sim.heat / 100, rap = sim.rapidT > 0;
    if (rap) this.hotMat.emissive.setRGB(0.2 + Math.sin(this.t * 20) * 0.1, 0.6, 1.2); else this.hotMat.emissive.setRGB(hf * hf * 1.4, hf * hf * 0.25, 0);
    this.eng.focus(0, -14);
    if (sim.locked && Math.random() < 0.3) this.parts.burst(sim.x, 1.8, -2, 1, 0xdddddd, 1, 0.3, 2.5, -1);
    this.hud.heat(rap ? 0 : hf, sim.locked, rap);
    this.hud.hp(sim.hp / sim.maxHp, sim.hp);
    if (this.hud.charge) this.hud.charge(sim.champOn ? Math.min(1, sim.charge / sim.chargeNeed) : 0, sim.charged, sim.champOn);
    // прицельная линия — прямо вперёд от пушки
    { const pos = this.aimLine.geometry.attributes.position; pos.setXYZ(0, sim.x, 0.15, -1.6); pos.setXYZ(1, sim.x, 0.15, -(sim.lastRowZ + 2)); pos.needsUpdate = true; this.aimLine.computeLineDistances(); this.aimLine.visible = this.phase !== "done"; }
    // ворота
    for (const m of this.gateM) {
      m.gg.position.x = m.gt.x;
      const tx = gateText(m.gt);
      if (tx !== m.txt) { m.txt = tx; redrawText(m.tex, tx, m.gt.grow ? "#fff2b0" : "#fff", null); }
      m.pop = Math.max(0, (m.pop || 0) - rdt * 5);
      const s = 1 + m.pop * 0.12; m.gg.scale.set(s, s, s);
      if (m.pm) { const empty = (m.gt.k === "+" || m.gt.k === "-") && m.gt.pool < 1; m.pm.opacity = empty ? 0.12 : 0.4 + Math.min(1, m.pop) * 0.3; }
      if (m.shield) { m.gg.visible = !m.gt.broken; }
    }
    // ящики
    for (const m of this.crateM) {
      const c = m.c, on = c.wait <= 0;
      m.g.position.x = c.x; m.lb.x = c.x;
      m.pop = Math.max(0, (m.pop || 0) - rdt * 6);
      const sc = on ? 1 + m.pop * 0.08 : Math.max(0.01, 1 - c.wait * 3) * 0.3;
      m.box.scale.setScalar(2.3 * sc); m.ring.rotation.y += rdt * 1.5; m.ring.visible = on;
      const give = c.gives[c.gi % c.gives.length];
      if (m.hp !== c.hp || m.give !== give || m.on !== on) { m.hp = c.hp; m.give = give; m.on = on; m.lb.el.firstChild.textContent = on ? Math.max(0, Math.ceil(c.hp)) : ""; m.lb.el.lastChild.textContent = on ? GIVE_TXT[give] : ""; m.lb.on = on; if (on) m.lb.pop(); }
    }
    // бойцы
    const S = this.S, ss = sim.soldiers, ns = Math.min(ss.length, S.cap);
    for (let i = 0; i < ns; i++) {
      const s = ss[i], age = CFG.soldier.life * (s.kind === "basic" ? 1 : 2.4) - s.life;
      const ty = s.kind === "basic" ? (s.sh ? 3 : 0) : SOL_T[s.kind];
      S.ty[i] = ty;
      S.x[i] = s.x; S.z[i] = -s.z; S.y[i] = age < 0.28 && !s.from && s.kind !== "champ" ? 1.3 * (1 - age / 0.28) + Math.sin(age / 0.28 * Math.PI) * 0.6 : 0;
      S.yaw[i] = Math.atan2(s.vx, -s.vz); S.run[i] = 1; S.atk[i] = s.kind === "champ" ? 0.4 : 0;
      S.s[i] = ty === 2 ? 3.1 * (0.75 + 0.25 * s.hp / s.max) : ty === 1 ? 2.1 : 1.35;
      S.ph[i] = (s.id * 1.7) % 6.28;
    }
    S.commit(ns);
    // враги
    let ne = 0, nb2 = 0;
    const E = this.E, EB = this.EB;
    for (const e of sim.enemies) {
      const yaw = Math.atan2(-e.x * 0.05, 1);
      if (e.type === "boss") {
        if (nb2 >= EB.cap) continue; const i = nb2++;
        EB.x[i] = e.x; EB.z[i] = -e.z; EB.y[i] = 0; EB.yaw[i] = 0; EB.s[i] = 4.4 * (e.hit > 0 ? 1.05 : 1); EB.run[i] = 0.5; EB.atk[i] = 0.5 + Math.sin(this.t * 3 + e.id) * 0.3; EB.ph[i] = e.id;
      } else {
        if (ne >= E.cap) continue; const i = ne++, ty = EN_T[e.type];
        const shoot = e.type === "archer" && e.z <= e.stop;
        E.ty[i] = ty; E.x[i] = e.x; E.z[i] = -e.z; E.y[i] = 0; E.yaw[i] = yaw;
        E.s[i] = (ty === 4 ? 2.8 : ty === 2 ? 1.75 : ty === 1 ? 1.2 : 1.4) * (e.hit > 0 ? 1.06 : 1);
        E.run[i] = shoot ? 0 : ty === 1 ? 1.6 : ty === 4 ? 0.5 : ty === 2 ? 0.6 : 1; E.atk[i] = ty === 4 ? 0.5 + Math.sin(this.t * 3 + e.id) * 0.3 : 0; E.ph[i] = (e.id * 2.1) % 6.28;
      }
      if (e.type === "giant" || e.type === "boss" || e.type === "tank") {
        if (!e.lb) { e.lb = this.labels.add("hpbar small", ""); e.lb.el.innerHTML = "<i></i><b></b>"; }
        e.lb.x = e.x; e.lb.z = -e.z; e.lb.y = e.type === "boss" ? 5 : e.type === "giant" ? 3.2 : 2.3; e.lb.seen = this.t;
        const f = Math.max(0, e.hp / e.max); if (e.lb.f !== f) { e.lb.f = f; e.lb.el.firstChild.style.width = f * 100 + "%"; e.lb.el.lastChild.textContent = Math.ceil(e.hp); }
      }
    }
    E.commit(ne); EB.commit(nb2);
    // стрелы лучников: дуга от лучника к пушке
    { const am = this.arrowM, m4 = this._m4 || (this._m4 = new THREE.Matrix4()), q = this._q || (this._q = new THREE.Quaternion()), p = this._p || (this._p = new THREE.Vector3()), one = new THREE.Vector3(1, 1, 1), e3 = this._e3 || (this._e3 = new THREE.Euler()); let k = 0;
      for (const a of sim.arrows) { if (k >= 80) break; const f = 1 - a.t / a.T; const x = lerp(a.x, a.tx, f), z = lerp(a.z, 0.5, f), y = 1.2 + Math.sin(f * Math.PI) * 4; const dy = Math.cos(f * Math.PI) * 4 * Math.PI / a.T; p.set(x, y, -z); e3.set(Math.atan2(dy, (a.z - 0.5) / a.T) * 0.6, Math.atan2(a.tx - a.x, -(0.5 - a.z)), 0); q.setFromEuler(e3); m4.compose(p, q, one); am.setMatrixAt(k++, m4); }
      am.count = k; am.instanceMatrix.needsUpdate = true; }
    // подписи, которые больше не нужны
    for (const L of this.labels.list.slice()) if (L.seen != null && L.seen < this.t - 0.05 && !L.tower) this.labels.remove(L);
    // башни
    const live = new Set();
    for (const tw of sim.towers) {
      live.add(tw.id);
      let m = this.towerM.find((q) => q.id === tw.id);
      if (!m) {
        const g = new THREE.Group(); g.position.set(tw.x, 0, -tw.z); this.world.add(g);
        const tm = cloneModel("building_tower_A_blue", { hue: 0.4 }); tm.scale.setScalar(2.6); g.add(tm);
        const lb = this.labels.add("hpbar small", ""); lb.el.innerHTML = "<i></i><b></b>"; lb.tower = 1; lb.x = tw.x; lb.y = 6.2; lb.z = -tw.z;
        m = { id: tw.id, g, lb }; this.towerM.push(m);
      }
      m.lb.el.firstChild.style.width = Math.max(0, tw.hp / tw.max * 100) + "%"; m.lb.el.lastChild.textContent = Math.ceil(tw.hp);
      m.g.position.x = tw.x + (Math.random() - 0.5) * 0.05 * (1 - tw.hp / tw.max);
    }
    for (let i = this.towerM.length - 1; i >= 0; i--) { const m = this.towerM[i]; if (!live.has(m.id)) { this.world.remove(m.g); this.labels.remove(m.lb); this.towerM.splice(i, 1); } }
    this.debris.update(dt); this.parts.update(dt);
    this.labels.update(this.eng.W, this.eng.H);
  }
}
