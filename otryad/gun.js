// «Отряд» — режим «Пушка»: отрисовка и управление поверх чистой логики gun-sim.js
import { THREE, Units, Debris, Particles, Labels, redrawText, buildScenery, fenceLine, placeModels, makeGate, makeCannonModel, makeBanner, cloneModel, pbr, boxUV, disposeGroup, clamp, lerp, BIOMES, BIOME_ORDER } from "./core.js";
import { GunSim, CFG, levelInfo } from "./gun-sim.js";
import { makeBot } from "./gun-bot.js";
import { play } from "./audio.js";

const T = window.TG;
const RED = 0xe5393b;
const M = {};
function mat(key, color, o) { if (!M[key]) { M[key] = new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.6, metalness: 0.1 }, o || {})); M[key].userData.keep = 1; } return M[key]; }
const gateText = (g) => g.k === "x" ? "×" + g.N : g.k === "+" ? "+" + Math.floor(g.pool) : g.k === "-" ? "−" + Math.ceil(g.pool) : g.broken ? "" : String(Math.ceil(g.pool));

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
    this.S = new Units(eng, CFG.soldier.maxAlive, look.color, look.hat, "blue"); this.world.add(this.S.mesh);
    this.EG = new Units(eng, 700, RED, "none", "red"); this.world.add(this.EG.mesh);              // пехота и бегуны
    this.ET = new Units(eng, 120, 0xc22f31, "helmet", "red"); this.world.add(this.ET.mesh);       // танки со щитами
    this.EB = new Units(eng, 24, 0xb3272a, "horns", "red"); this.world.add(this.EB.mesh);         // великаны и босс
    this.EB.lodScale = 3; this.ET.lodScale = 1.6; this.S.lodScale = 1.5; this.EG.lodScale = 1.5;
    this.debris.setTeam(look.color);
    this.shieldM = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.5, 0.5, 0.1, 14).rotateX(Math.PI / 2), mat("tshield", 0xa8b0ba, { metalness: 0.8, roughness: 0.3 }), 120); this.shieldM.frustumCulled = false; this.shieldM.castShadow = true; this.world.add(this.shieldM);
    this.phase = "intro"; this.t = 0; this.firing = false; this.evT = {}; this.result = null; this.lastHp = this.sim.hp;
    this.tut = 0; this.slowT = 0;
    this.camera(1);
    this.hud.hp(1); this.hud.heat(0, false); this.hud.wave(0, this.sim.lv.waves.length);
  }
  dispose() {
    if (!this.world) return;
    this.labels.clear(); this.debris.clear(); this.parts.clear();
    [this.S, this.EG, this.ET, this.EB].forEach((u) => u && u.dispose());
    disposeGroup(this.world); this.world = null;
  }
  buildField() {
    const w = this.world, B = this.B, F = CFG.field, hw = F.hw, bid = this.eng.biomeId;
    // поле: мощёная площадка на скале, заборы по бокам
    const L = F.len + 10;
    const ground = new THREE.Mesh(boxUV(new THREE.BoxGeometry(hw * 2, 0.8, L), hw * 2, 0.8, L, 3), pbr(B.road, { roughness: 0.85 })); ground.position.set(0, -0.4, -(F.len / 2 + 1)); ground.receiveShadow = true; w.add(ground);
    const cliff = new THREE.Mesh(boxUV(new THREE.BoxGeometry(hw * 2 + 0.4, 9, L), hw * 2 + 0.4, 9, L, 5), pbr(B.cliff, { roughness: 0.95 })); cliff.position.set(0, -5.3, -(F.len / 2 + 1)); cliff.receiveShadow = true; w.add(cliff);
    for (const sd of [-1, 1]) fenceLine(w, bid, sd * (hw + 0.12), 4, -(F.len + 4), 0);
    // линия обороны: красные колья и бочки у пушки
    const line = new THREE.Mesh(new THREE.BoxGeometry(hw * 2, 0.03, 0.22), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff3a3a).multiplyScalar(1.6), toneMapped: false })); line.position.set(0, 0.02, -F.baseZ); w.add(line);
    placeModels(w, "Barrel", [[-hw + 0.8, 0, 0.6, 1, 0.5], [hw - 0.8, 0, 0.8, 1, 2], [hw - 1.6, 0, 0.9, 0.9, 1]], { shadow: true });
    placeModels(w, "Crate_Wooden", [[-hw + 1.7, 0, 1.0, 0.9, 0.3]], { shadow: true });
    for (const sd of [-1, 1]) { const bn = makeBanner(B.banner); bn.position.set(sd * (hw + 0.8), 0, -2.5); bn.rotation.y = sd > 0 ? -Math.PI / 2 : Math.PI / 2; bn.scale.setScalar(1.3); w.add(bn); }
    // вражеская крепость вдали: стена, ворота, башни (KayKit, перекрашены в красный)
    const fort = new THREE.Group(); fort.position.z = -(F.spawnZ + 3.5); w.add(fort);
    for (const sd of [-1, 1]) {
      const wl = cloneModel("wall_straight", { hue: 0.4 }); wl.scale.setScalar(2.4); wl.position.set(sd * 3.9, 0, 0); fort.add(wl);
      const tw = cloneModel("building_tower_A_blue", { hue: 0.4 }); tw.scale.setScalar(3.2); tw.position.set(sd * (hw + 0.6), 0, 0.3); fort.add(tw);
      const bn = makeBanner(0xc0392b); bn.position.set(sd * 1.7, 0, 1.4); bn.scale.setScalar(1.5); fort.add(bn);
    }
    // пушка
    const cn = new THREE.Group(); w.add(cn);
    const model = makeCannonModel(); cn.add(model);
    cn.position.set(0, 0, 0.4);
    this.cannon = cn; this.yaw = model; this.barrel = model.userData.pitch; this.body = model.userData.barrel;
    this.hotMat = model.userData.barrel.material.clone(); this.hotMat.userData.keep = 0; model.userData.barrel.material = this.hotMat;
    this.barrel.rotation.x = 0.12;
    // линия прицела
    const lg = new THREE.BufferGeometry(); lg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(3 * 12), 3));
    this.aimLine = new THREE.Line(lg, new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 0.5, gapSize: 0.35, transparent: true, opacity: 0.75 }));
    w.add(this.aimLine);
    // ворота
    this.gateM = [];
    for (const r of this.sim.rows) for (const gt of r.gates) {
      const gg = new THREE.Group(); gg.position.z = -r.z; w.add(gg);
      const W = gt.w;
      if (gt.k === "#") {
        const wood = pbr("planks", { roughness: 0.8 });
        const wall = new THREE.Mesh(boxUV(new THREE.BoxGeometry(W - 0.1, 1.5, 0.5), W - 0.1, 1.5, 0.5, 1.2), wood); wall.position.y = 0.75; wall.castShadow = true; gg.add(wall);
        for (const sx of [-1, 1]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.9, 0.6), mat("iron", 0x4a4e56, { metalness: 0.7, roughness: 0.4 })); post.position.set(sx * (W / 2 - 0.1), 0.95, 0); post.castShadow = true; gg.add(post); }
        for (let i = 0; i < 2; i++) { const band = new THREE.Mesh(new THREE.BoxGeometry(W - 0.05, 0.1, 0.55), mat("iron", 0x4a4e56, { metalness: 0.7, roughness: 0.4 })); band.position.y = 0.35 + i * 0.8; gg.add(band); }
        const G = makeGate(1.7, gateText(gt), "bad", 0.1); const lab = G.lab; lab.position.set(0, 1.95, 0.1); gg.add(lab);
        gg.rotation.x = -0.25;
        this.gateM.push({ gt, gg, tex: G.tex, wall, txt: gateText(gt), shield: 1 });
        continue;
      }
      const goodG = gt.k === "x" || gt.k === "+";
      const G = makeGate(W, gateText(gt), goodG ? (gt.k === "x" ? "mult" : "plus") : "bad", 2.2);
      gg.add(G.g);
      gg.rotation.x = -0.3;
      this.gateM.push({ gt, gg, tex: G.tex, pm: G.pm, txt: gateText(gt) });
    }
    this.towerM = [];
    buildScenery(w, bid, 14, -(F.len + 40), { inner: hw + 1, seed: this.n * 31 + 7 });
  }
  // ---------- ввод ----------
  aimDrag(dxPx, W) { this.sim.aim = clamp(this.sim.aim + dxPx / W * 2.4, -CFG.cannon.aimMax, CFG.cannon.aimMax); this.dragged = true; }
  setFiring(on) { this.firing = on; if (on && this.phase === "intro") this.start(); }
  start() { if (this.phase !== "intro") return; this.phase = "play"; play("gong", { vol: 0.6 }); }
  setAuto(kind) { this.auto = kind ? makeBot(kind, 3) : null; }
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
    if (this.n !== 1) return;
    const H = this.hud;
    if (this.tut === 0) { this.tut = 1; H.hint("👆 Веди пальцем — целься, держи — стреляй", "drag"); }
    if (this.tut === 1 && this.sim.fired > 6) { this.tut = 2; H.hint("Стреляй сквозь «×2» — бойцов станет вдвое больше!", "gate"); setTimeout(() => this.tut === 2 && H.hint(null), 3500); }
    if (this.tut === 2 && this.sim.locked) { this.tut = 3; H.hint("Перегрев! Отпусти палец — ствол остынет", "heat"); setTimeout(() => H.hint(null), 2600); }
  }
  handleEvents() {
    const sim = this.sim, now = this.t, gap = (k, g) => { if (now - (this.evT[k] || -9) < g) return false; this.evT[k] = now; return true; };
    for (const e of sim.ev) {
      switch (e.t) {
        case "shot": if (gap("shot", 0.07)) play("xbow", { vol: 0.55, gap: 0.06 }); this.recoil = 1; if (gap("hshot", 0.12)) T.haptic("impact", "light"); if (gap("muz", 0.1)) this.parts.fx.muzzle(Math.sin(this.sim.aim) * 2.2, 1.7, -Math.cos(this.sim.aim) * 2.2 + 0.4, Math.sin(this.sim.aim), -Math.cos(this.sim.aim)); break;
        case "gate": {
          const gm = this.gateM.find((m) => m.gt === e.g); if (gm) gm.pop = 1;
          if (e.k === "x") { if (gap("gx", 0.09)) play("coin2", { vol: 0.45, rate: 1 + Math.min(0.6, e.g.N * 0.12), gap: 0.08 }); this.parts.burst(e.x, 1.2, -e.z, 2, 0x7cc8ff, 3, 0.12, 2, 6); }
          else if (e.k === "+") { if (gap("gp", 0.1)) play("coin", { vol: 0.4, gap: 0.09 }); this.parts.burst(e.x, 1.2, -e.z, 2, 0x7dff9a, 3, 0.12, 2, 6); }
          else { if (gap("gm", 0.12)) play("error", { vol: 0.35, gap: 0.1 }); this.parts.burst(e.x, 1, -e.z, 3, this.look.color, 3, 0.12, 2); }
          break;
        }
        case "shield": if (gap("sh", 0.08)) play("stonehit", { vol: 0.45, gap: 0.07 }); this.parts.burst(e.x, 0.9, -e.z, 3, 0xc89a5a, 3, 0.12, 2); { const gm = this.gateM.find((m) => m.gt === e.g); if (gm) gm.pop = 1; } break;
        case "shield_break": play("collapse", { vol: 0.6 }); this.eng.shake(0.25); { const gm = this.gateM.find((m) => m.gt === e.g); if (gm) this.parts.burst(gm.gg.position.x, 0.8, gm.gg.position.z, 14, 0x8a5a2e, 6, 0.25, 5); } break;
        case "shield_up": play("confirm", { vol: 0.3 }); break;
        case "clash": if (gap("cl", 0.06)) play(Math.random() < 0.5 ? "hit" : "hit2", { vol: 0.4, gap: 0.05 }); if (Math.random() < 0.4) this.parts.sparks(e.x, 0.7, -e.z, 2); if (Math.random() < 0.12) this.debris.add(e.x, 0.4, -e.z, (Math.random() - 0.5) * 5, 5, 2 + Math.random() * 3, this.look.color, Math.PI, 0); break;
        case "kill": {
          const big = e.type === "giant" || e.type === "boss" || e.type === "tank";
          if (big || Math.random() < 0.35) this.debris.add(e.x, 0.3, -e.z, (Math.random() - 0.5) * 6, 5 + Math.random() * 4, -3 - Math.random() * 4, RED, 0, 0);
          else this.parts.burst(e.x, 0.5, -e.z, 3, RED, 4, 0.14, 3);
          if (big) { play(e.type === "tank" ? "stonehit" : "collapse", { vol: 0.7 }); this.eng.shake(e.type === "tank" ? 0.15 : 0.5); this.parts.sparks(e.x, 1, -e.z, 14); this.parts.dust(e.x, -e.z, e.type === "tank" ? 6 : 14, e.type === "tank" ? 0.5 : 1); T.haptic("impact", "medium"); }
          else if (gap("kill", 0.1)) play("bone", { vol: 0.3, gap: 0.08 });
          break;
        }
        case "bossdie": this.slowT = 1.0; this.eng.shake(1); play("roar", { vol: 0.8, rate: 0.7 }); T.haptic("notify", "success"); this.hud.toast("Великан повержен!"); break;
        case "base": play("heavy", { vol: 0.8, gap: 0.08 }); this.eng.shake(0.25 + Math.min(0.6, e.dmg * 0.08)); T.haptic("impact", "heavy"); this.parts.explosion(e.x, -1.2, 0.8 + Math.min(1.5, e.dmg * 0.15)); this.hud.hurt(); break;
        case "wave": play("gong", { vol: 0.55 }); this.hud.wave(e.i, e.n); this.hud.toast(e.i === e.n ? "Последняя волна!" : `Волна ${e.i} из ${e.n}`); break;
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
    this.result = { win, stars, coins, hp: sim.hp, maxHp: sim.maxHp, kills: sim.killed, made: sim.made, fired: sim.fired };
    if (win) { play("perk", { vol: 0.8 }); T.haptic("notify", "success"); this.hud.toast("Победа!"); for (let k = 0; k < 4; k++) setTimeout(() => this.parts && this.parts.burst((Math.random() - 0.5) * 8, 6, -14 - Math.random() * 10, 30, [0xffd34a, 0x5ac8ff, 0xff6ad5, 0x7dff8a][k], 7, 0.16, 8, 9), k * 220); }
    else { play("die2", { vol: 0.8 }); T.haptic("notify", "error"); this.hud.toast("Пушку сломали!"); this.eng.shake(0.8); this.parts.burst(0, 1.2, 0, 40, 0x3a3f4a, 8, 0.3, 7); }
    setTimeout(() => this.hud.end(this.result), 1100);
  }
  camera(dt) {
    const cam = this.eng.camera, a = this.eng.W / this.eng.H;
    // портрет: поле во всю ширину; на широком экране — ближе
    const fov = a < 0.75 ? 70 : 58;
    if (cam.fov !== fov) { cam.fov = fov; cam.updateProjectionMatrix(); }
    cam.position.set(0, 19, 7);
    cam.lookAt(0, 0, -15);
  }
  render(rdt, dt) {
    const sim = this.sim, F = CFG.field;
    this.camera(rdt);
    // пушка
    this.yaw.rotation.y = -sim.aim;
    this.recoil = Math.max(0, (this.recoil || 0) - rdt * 8);
    this.barrel.position.z = this.recoil * 0.3; this.barrel.position.y = 1.45;
    const hf = sim.heat / 100;
    this.hotMat.emissive.setRGB(hf * hf * 1.4, hf * hf * 0.25, 0);
    this.eng.focus(0, -14);
    if (sim.locked && Math.random() < 0.3) this.parts.burst(Math.sin(sim.aim) * 2, 1.6, -Math.cos(sim.aim) * 2, 1, 0xdddddd, 1, 0.3, 2.5, -1);
    this.hud.heat(hf, sim.locked);
    this.hud.hp(sim.hp / sim.maxHp, sim.hp);
    // прицельная линия до последнего ряда
    {
      const C = CFG.cannon, S = CFG.soldier, hw = F.hw - S.r, pos = this.aimLine.geometry.attributes.position;
      let x = Math.sin(sim.aim) * C.muzzle, z = Math.cos(sim.aim) * C.muzzle, vx = Math.sin(sim.aim), vz = Math.cos(sim.aim), i = 0;
      pos.setXYZ(i++, x, 0.15, -z);
      const zEnd = sim.lastRowZ + 2;
      while (i < 11 && z < zEnd) {
        let tz = (zEnd - z) / vz, tw = vx > 0 ? (hw - x) / vx : vx < 0 ? (-hw - x) / vx : 1e9;
        const tt = Math.min(tz, tw); x += vx * tt; z += vz * tt; pos.setXYZ(i++, x, 0.15, -z);
        if (tw < tz) vx = -vx;
      }
      for (; i < 12; i++) pos.setXYZ(i, x, 0.15, -z);
      pos.needsUpdate = true; this.aimLine.computeLineDistances(); this.aimLine.visible = this.phase !== "done";
    }
    // ворота
    for (const m of this.gateM) {
      m.gg.position.x = m.gt.x;
      const tx = gateText(m.gt);
      if (tx !== m.txt) { m.txt = tx; redrawText(m.tex, tx, "#fff", null); }
      m.pop = Math.max(0, (m.pop || 0) - rdt * 5);
      const s = 1 + m.pop * 0.12; m.gg.scale.set(s, s, s);
      if (m.pm) { const empty = (m.gt.k === "+" || m.gt.k === "-") && m.gt.pool < 1; m.pm.opacity = empty ? 0.12 : 0.4 + m.pop * 0.3; }
      if (m.shield) { m.gg.visible = !m.gt.broken; }
    }
    // бойцы
    const S = this.S, ss = sim.soldiers, ns = Math.min(ss.length, S.cap);
    for (let i = 0; i < ns; i++) {
      const s = ss[i], age = CFG.soldier.life - s.life;
      S.x[i] = s.x; S.z[i] = -s.z; S.y[i] = age < 0.28 && !s.from ? 1.3 * (1 - age / 0.28) + Math.sin(age / 0.28 * Math.PI) * 0.6 : 0;
      S.yaw[i] = Math.atan2(s.vx, -s.vz); S.run[i] = 1; S.s[i] = 1.35; S.atk[i] = 0;
      S.ph[i] = (s.id * 1.7) % 6.28;
    }
    S.commit(ns);
    // враги
    let ng = 0, nt = 0, nb = 0;
    const EG = this.EG, ET = this.ET, EB = this.EB, sm = this.shieldM.instanceMatrix.array;
    for (const e of sim.enemies) {
      const yaw = Math.atan2(-e.x * 0.05, 1);
      if (e.type === "grunt" || e.type === "runner") {
        if (ng >= EG.cap) continue; const i = ng++;
        EG.x[i] = e.x; EG.z[i] = -e.z; EG.y[i] = 0; EG.yaw[i] = yaw; EG.s[i] = e.type === "runner" ? 1.15 : 1.4; EG.run[i] = e.type === "runner" ? 1.6 : 1; EG.atk[i] = 0; EG.ph[i] = (e.id * 2.1) % 6.28;
      } else if (e.type === "tank") {
        if (nt >= ET.cap) continue; const i = nt++;
        ET.x[i] = e.x; ET.z[i] = -e.z; ET.y[i] = 0; ET.yaw[i] = yaw; ET.s[i] = 1.9 + (e.hit > 0 ? 0.12 : 0); ET.run[i] = 0.6; ET.atk[i] = 0.3; ET.ph[i] = e.id;
        const o = i * 16, w = 1.3 * (0.4 + 0.6 * e.hp / e.max);
        sm[o] = w; sm[o + 1] = 0; sm[o + 2] = 0; sm[o + 3] = 0; sm[o + 4] = 0; sm[o + 5] = 1.05; sm[o + 6] = 0; sm[o + 7] = 0; sm[o + 8] = 0; sm[o + 9] = 0; sm[o + 10] = 1; sm[o + 11] = 0; sm[o + 12] = e.x; sm[o + 13] = 0.9; sm[o + 14] = -e.z + 0.65; sm[o + 15] = 1;
      } else {
        if (nb >= EB.cap) continue; const i = nb++;
        const boss = e.type === "boss";
        EB.x[i] = e.x; EB.z[i] = -e.z; EB.y[i] = 0; EB.yaw[i] = 0; EB.s[i] = (boss ? 4.4 : 2.7) * (e.hit > 0 ? 1.05 : 1); EB.run[i] = 0.5; EB.atk[i] = 0.5 + Math.sin(this.t * 3 + e.id) * 0.3; EB.ph[i] = e.id;
        if (!e.lb) { e.lb = this.labels.add("hpbar small", ""); e.lb.el.innerHTML = "<i></i><b></b>"; }
        e.lb.x = e.x; e.lb.z = -e.z; e.lb.y = EB.s[i] * 1.12; e.lb.seen = this.t;
        const f = Math.max(0, e.hp / e.max); if (e.lb.f !== f) { e.lb.f = f; e.lb.el.firstChild.style.width = f * 100 + "%"; e.lb.el.lastChild.textContent = Math.ceil(e.hp); }
      }
    }
    EG.commit(ng); ET.commit(nt); EB.commit(nb);
    this.shieldM.count = nt; this.shieldM.instanceMatrix.needsUpdate = true;
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
