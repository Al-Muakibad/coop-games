// «Очаг» — интерфейс: стол на канвасе (камера, карты-спрайты, анимации), перетаскивание, HUD, экраны.
import * as S from "./sim.js";
import { CARDS, CATS, RECIPES, RNAME, PACKS, PACK_LOCK, BIOMES, QUESTS, DAY_LEN, EAT, CW, CH, BOSS_DAY } from "./data.js";
import { drawIcon, PACK_ICON } from "./art.js";
import { play, music, SET, saveSet } from "./audio.js";
import * as SV from "./save.js";

const T = window.TG || { haptic() {}, init() {}, shareGame() {}, tg: null };
const St = window.Stats || { event() {}, gameStart() {}, gameEnd() {}, state() {} };
const $ = (id) => document.getElementById(id);
const L = (s) => (window.I18N ? I18N.t(s) : s);
const haptic = (a, b) => { try { T.haptic(a, b); } catch (_) {} };
const DEV = /[?&]dev=1/.test(location.search);

let G = null, board = "home";
const cv = $("board"), ctx = cv.getContext("2d", { alpha: false });
let W = 0, Hh = 0, DPR = 1;
const cams = {};
let cam = { x: 750, y: 900, z: 1 };
let speed = 1, paused = false, modal = "", lastT = 0, saveT = 0, hudT = 0, clock = 0;
let shake = 0;
const RS = new Map();              // отрисовочное состояние карт: id → {x, y, s, fl, sh, fly}
const Z = new Map(); let zc = 1;   // порядок стопок
const parts = [];                  // частицы
let drag = null, target = null, selected = 0;
let hudTop = 150, trayTop = 700;     // низ верхней панели и верх магазина (экранные px)

/* ---------- размеры ---------- */
function resize() {
  DPR = Math.min(2, window.devicePixelRatio || 1);
  W = innerWidth; Hh = innerHeight;
  cv.width = Math.round(W * DPR); cv.height = Math.round(Hh * DPR);
}
addEventListener("resize", () => { resize(); clampCam(); });
resize();
function defZoom() { return W < 700 ? Math.max(0.7, Math.min(1.1, W / (CW * 5.4))) : Math.min(1.5, Hh / (CH * 5.6)); }
function minZoom() { const B = BIOMES[board]; return Math.max(0.35, Math.min(W / (B.w + 80), Hh / (B.h + 260))); }
function clampCam() {
  const B = BIOMES[board];
  cam.z = Math.max(minZoom(), Math.min(2.4, cam.z));
  cam.x = Math.max(0, Math.min(B.w, cam.x)); cam.y = Math.max(-40, Math.min(B.h + 60, cam.y));
}
const w2s = (x, y) => [(x - cam.x) * cam.z + W / 2, (y - cam.y) * cam.z + Hh / 2];
const s2w = (x, y) => [(x - W / 2) / cam.z + cam.x, (y - Hh / 2) / cam.z + cam.y];

/* ---------- шрифты ---------- */
const FONT = 'Nunito, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
const INK = "#3b2618", PAPER = "#f7ecd6";
/* ---------- спрайты карт ---------- */
const SPR = new Map();
const PAD = 8;
// анимированные иконки: на спрайте карты их нет, рисуются поверх каждый кадр (покачивание, огонь)
const ANIM = { tree: "sway", appletree: "sway", bush: "sway", palm: "sway", grass: "sway", deadtree: "sway", campfire: "fire", beacon: "glow", lantern: "glow", hive: "bob" };
function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
function fitFont(c, text, max, size, min) {
  let s = size;
  for (; s > min; s -= 0.5) { c.font = `800 ${s}px ${FONT}`; if (c.measureText(text).width <= max) return s; }
  c.font = `800 ${min}px ${FONT}`; return min;
}
// льняная фактура бумаги
let LINEN = null;
function linen() {
  if (LINEN) return LINEN;
  LINEN = document.createElement("canvas"); LINEN.width = LINEN.height = 48;
  const x = LINEN.getContext("2d");
  let seed = 11; const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 48; i += 2) {
    x.fillStyle = `rgba(120,84,40,${0.025 + r() * 0.035})`; x.fillRect(0, i, 48, 1);
    x.fillStyle = `rgba(120,84,40,${0.02 + r() * 0.03})`; x.fillRect(i, 0, 1, 48);
  }
  for (let i = 0; i < 70; i++) { x.fillStyle = r() < 0.5 ? "rgba(255,255,255,.25)" : "rgba(110,70,30,.08)"; x.fillRect(r() * 48, r() * 48, 1 + r() * 2, 1); }
  return LINEN;
}
function drawBottomBadges(c, d) {
  c.textAlign = "center"; c.textBaseline = "middle";
  if (d.v != null && d.v > 0) {
    c.fillStyle = "#e9b949"; c.beginPath(); c.arc(CW - 12, CH - 9.5, 6.5, 0, 6.283); c.fill();
    c.lineWidth = 1.2; c.strokeStyle = "#8a6216"; c.stroke();
    c.fillStyle = "rgba(255,255,255,.45)"; c.beginPath(); c.arc(CW - 14, CH - 12, 2, 0, 6.283); c.fill();
    c.font = `900 9.5px ${FONT}`; c.fillStyle = "#4a3206"; c.fillText(String(d.v), CW - 12, CH - 9);
  }
  if (d.atk) {
    c.save(); c.translate(10, CH - 9.5); c.rotate(-0.78);
    c.fillStyle = "#dfe4e2"; c.fillRect(-1.6, -7, 3.2, 9.5); c.strokeStyle = "rgba(59,38,24,.6)"; c.lineWidth = 0.8; c.strokeRect(-1.6, -7, 3.2, 9.5);
    c.fillStyle = "#8a5a2b"; c.fillRect(-4, 2, 8, 2.2); c.restore();
    c.font = `900 10px ${FONT}`; c.fillStyle = INK; c.textAlign = "left"; c.fillText(String(d.atk), 17, CH - 9); c.textAlign = "center";
  }
}
function drawCardFace(c, k, noIcon) {
  const d = CARDS[k], cat = CATS[d.c];
  // тень-подложка внутри спрайта (мягкая, на 1.5 px вниз)
  rr(c, 0.5, 1.6, CW - 1, CH - 0.6, 9); c.fillStyle = "rgba(60,34,14,.28)"; c.fill();
  // бумага
  rr(c, 0, 0, CW, CH, 9); c.fillStyle = PAPER; c.fill();
  c.save(); rr(c, 0, 0, CW, CH, 9); c.clip();
  c.fillStyle = c.createPattern(linen(), "repeat"); c.fillRect(0, 0, CW, CH);
  // шапка категории
  const hg = c.createLinearGradient(0, 0, 0, 21); hg.addColorStop(0, cat.c); hg.addColorStop(1, cat.m || cat.c);
  c.fillStyle = hg; c.fillRect(0, 0, CW, 20.5);
  c.fillStyle = "rgba(255,255,255,.22)"; c.fillRect(0, 0, CW, 1.5);
  c.fillStyle = "rgba(59,38,24,.22)"; c.fillRect(0, 20.5, CW, 1);
  // нижняя кромка бумаги чуть темнее
  const bg = c.createLinearGradient(0, CH - 22, 0, CH); bg.addColorStop(0, "rgba(140,96,50,0)"); bg.addColorStop(1, "rgba(140,96,50,.14)");
  c.fillStyle = bg; c.fillRect(0, CH - 22, CW, 22);
  c.restore();
  // окно с картинкой
  rr(c, 5, 24, CW - 10, CH - 43, 7);
  const ig = c.createRadialGradient(CW / 2, 50, 4, CW / 2, 56, 46); ig.addColorStop(0, cat.t2 || "#fffaf0"); ig.addColorStop(1, cat.t);
  c.fillStyle = ig; c.fill();
  c.save(); rr(c, 5, 24, CW - 10, CH - 43, 7); c.clip();
  c.strokeStyle = "rgba(90,58,28,.22)"; c.lineWidth = 3; rr(c, 4, 22.5, CW - 8, CH - 40, 8); c.stroke();
  c.restore();
  c.lineWidth = 1; c.strokeStyle = "rgba(90,58,28,.35)"; rr(c, 5, 24, CW - 10, CH - 43, 7); c.stroke();
  if (!noIcon) drawIcon(c, k, (CW - 52) / 2, 25.5, 52);
  // рамка
  rr(c, 0.75, 0.75, CW - 1.5, CH - 1.5, 8.5); c.lineWidth = 1.5; c.strokeStyle = "rgba(59,38,24,.92)"; c.stroke();
  // имя
  const name = L(d.n);
  c.fillStyle = "#fffaf0"; c.textAlign = "center"; c.textBaseline = "middle";
  c.shadowColor = "rgba(40,20,5,.45)"; c.shadowOffsetY = 1; c.shadowBlur = 0;
  fitFont(c, name, CW - 10, 11.5, 8.5);
  if (c.measureText(name).width > CW - 8) {
    const sp = name.lastIndexOf(" ", Math.ceil(name.length / 2) + 3);
    const a = sp > 0 ? name.slice(0, sp) : name.slice(0, Math.ceil(name.length / 2)), b = sp > 0 ? name.slice(sp + 1) : name.slice(Math.ceil(name.length / 2));
    fitFont(c, a.length > b.length ? a : b, CW - 10, 9, 7);
    c.fillText(a, CW / 2, 6.5); c.fillText(b, CW / 2, 15);
  } else c.fillText(name, CW / 2, 11);
  c.shadowColor = "transparent"; c.shadowOffsetY = 0;
  drawBottomBadges(c, d);
}
function sprite(k, sc, noIcon) {
  const key = k + "|" + sc + (noIcon ? "|n" : "");
  let s = SPR.get(key);
  if (s) return s;
  s = document.createElement("canvas");
  s.width = Math.ceil((CW + PAD * 2) * sc); s.height = Math.ceil((CH + PAD * 2) * sc);
  const c = s.getContext("2d"); c.scale(sc, sc); c.translate(PAD, PAD);
  drawCardFace(c, k, noIcon);
  SPR.set(key, s);
  return s;
}
// иконка отдельным спрайтом (для анимированных карт)
const ISPR = new Map();
function iconSprite(k, sc) {
  const key = k + "|" + sc; let s = ISPR.get(key); if (s) return s;
  s = document.createElement("canvas"); s.width = s.height = Math.ceil(60 * sc);
  const c = s.getContext("2d"); c.scale(sc, sc); drawIcon(c, k, 4, 4, 52);
  ISPR.set(key, s); return s;
}
const BUCKETS = [0.5, 0.75, 1, 1.5, 2, 3, 4];
function bucket() { const px = cam.z * DPR; for (const b of BUCKETS) if (b >= px * 0.92) return b; return 4; }
// тень стопки
let SHADOW = null;
function shadowSprite() {
  if (SHADOW) return SHADOW;
  SHADOW = document.createElement("canvas"); SHADOW.width = 128; SHADOW.height = 160;
  const c = SHADOW.getContext("2d"); c.filter = "blur(7px)"; c.fillStyle = "rgba(48,24,8,.6)"; rr(c, 20, 22, 88, 116, 14); c.fill();
  if (!c.filter || c.filter === "none") { /* без blur — запасная мягкая тень */ }
  return SHADOW;
}
// радиальные пятна света (белое — для «вырезания» темноты, тёплое — для свечения)
function radial(stops, size) {
  const c = document.createElement("canvas"); c.width = c.height = size || 128; const x = c.getContext("2d");
  const h = c.width / 2, g = x.createRadialGradient(h, h, 0, h, h, h);
  for (const [o, col] of stops) g.addColorStop(o, col);
  x.fillStyle = g; x.fillRect(0, 0, c.width, c.width); return c;
}
const LIGHT = radial([[0, "rgba(255,255,255,1)"], [0.35, "rgba(255,255,255,.85)"], [0.7, "rgba(255,255,255,.3)"], [1, "rgba(255,255,255,0)"]]);
const GLOW = radial([[0, "rgba(255,190,90,.9)"], [0.3, "rgba(255,150,60,.45)"], [1, "rgba(255,110,30,0)"]]);
const SOFT = radial([[0, "rgba(255,255,255,1)"], [0.5, "rgba(255,255,255,.5)"], [1, "rgba(255,255,255,0)"]], 32);
// значок-иконка как картинка (для DOM)
const ICON_URL = new Map();
export function iconURL(k, size) {
  size = size || 44;
  const key = k + "|" + size; let u = ICON_URL.get(key); if (u) return u;
  const c = document.createElement("canvas"); c.width = c.height = size * 2; const x = c.getContext("2d"); drawIcon(x, k, 0, 0, size * 2);
  u = c.toDataURL(); ICON_URL.set(key, u); return u;
}

/* ---------- стол: деревянная столешница и войлочный коврик края ---------- */
const PAT = {};
function woodTile() {
  const S = 256, c = document.createElement("canvas"); c.width = c.height = S; const x = c.getContext("2d");
  let seed = 3; const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const tones = ["#6e472b", "#664127", "#744c2e", "#5f3c23"];
  for (let p = 0; p < 4; p++) {
    const y0 = p * 64;
    x.fillStyle = tones[p]; x.fillRect(0, y0, S, 64);
    for (let i = 0; i < 16; i++) {
      const yy = y0 + 4 + r() * 56, a = 0.05 + r() * 0.1, amp = 1 + r() * 3, ph = r() * 6;
      x.strokeStyle = r() < 0.6 ? `rgba(40,20,8,${a})` : `rgba(255,210,160,${a * 0.6})`; x.lineWidth = 0.8 + r() * 1.4;
      x.beginPath(); for (let xx = 0; xx <= S; xx += 8) { const yv = yy + Math.sin(xx / 40 + ph) * amp; xx ? x.lineTo(xx, yv) : x.moveTo(xx, yv); } x.stroke();
    }
    if (r() < 0.8) { const kx = r() * S, ky = y0 + 16 + r() * 32; x.fillStyle = "rgba(40,20,8,.25)"; x.beginPath(); x.ellipse(kx, ky, 7, 3.5, 0, 0, 6.283); x.fill(); x.strokeStyle = "rgba(40,20,8,.15)"; x.lineWidth = 1; x.beginPath(); x.ellipse(kx, ky, 12, 6, 0, 0, 6.283); x.stroke(); }
    x.fillStyle = "rgba(25,12,4,.55)"; x.fillRect(0, y0, S, 2);
    x.fillStyle = "rgba(255,220,180,.10)"; x.fillRect(0, y0 + 2, S, 1);
    const sx = (p * 97 + 40) % S; x.fillStyle = "rgba(25,12,4,.45)"; x.fillRect(sx, y0, 2, 64);
  }
  return c;
}
function feltTile(b) {
  const S = 160, c = document.createElement("canvas"); c.width = c.height = S; const x = c.getContext("2d");
  const B = BIOMES[b];
  x.fillStyle = B.bg[0]; x.fillRect(0, 0, S, S);
  let seed = 7; const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 1400; i++) { x.fillStyle = r() < 0.5 ? "rgba(255,248,225,.07)" : "rgba(40,25,10,.07)"; x.fillRect(r() * S, r() * S, 1 + r() * 1.5, 1 + r() * 1.5); }
  for (let i = 0; i < 120; i++) { const px = r() * S, py = r() * S, a = r() * 6.28; x.strokeStyle = r() < 0.5 ? "rgba(255,248,225,.09)" : "rgba(40,25,10,.08)"; x.lineWidth = 0.7; x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * 5, py + Math.sin(a) * 5); x.stroke(); }
  for (let i = 0; i < 26; i++) {
    const px = r() * S, py = r() * S;
    if (b === "home") { x.strokeStyle = r() < 0.5 ? "rgba(70,100,40,.22)" : "rgba(220,235,170,.22)"; x.lineWidth = 1.4; x.beginPath(); x.moveTo(px, py); x.quadraticCurveTo(px - 1, py - 4, px - 3, py - 7); x.moveTo(px + 2, py); x.quadraticCurveTo(px + 3, py - 4, px + 4, py - 6); x.stroke(); }
    else if (b === "island") { x.fillStyle = r() < 0.5 ? "rgba(170,130,70,.22)" : "rgba(255,245,215,.35)"; x.beginPath(); x.arc(px, py, 0.8 + r() * 1.4, 0, 6.283); x.fill(); }
    else if (b === "mountains") { x.fillStyle = r() < 0.5 ? "rgba(80,74,70,.18)" : "rgba(240,236,228,.22)"; x.beginPath(); x.ellipse(px, py, 2 + r() * 3, 1.3 + r() * 2, r() * 3, 0, 6.283); x.fill(); }
    else { x.strokeStyle = r() < 0.5 ? "rgba(25,35,25,.3)" : "rgba(150,170,130,.18)"; x.lineWidth = 1.2; x.beginPath(); x.moveTo(px, py); x.lineTo(px - 1, py - 5); x.stroke(); }
  }
  return c;
}
function pattern(b) {
  if (PAT[b]) return PAT[b];
  PAT[b] = ctx.createPattern(b === "wood" ? woodTile() : feltTile(b), "repeat");
  return PAT[b];
}
const OUT = { home: "#5b3b25", island: "#5b3b25", mountains: "#5b3b25", haunted: "#4a3020" };
// карта света для вечера и ночи (в 4 раза меньше экрана)
const LM = document.createElement("canvas"), lctx = LM.getContext("2d");

/* ---------- частицы и эффекты ---------- */
function burst(x, y, n, col, opt) {
  opt = opt || {};
  for (let i = 0; i < n; i++) {
    const a = Math.random() * 6.283, v = (opt.v || 120) * (0.4 + Math.random() * 0.8);
    parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - (opt.up || 60), life: 0, max: (opt.life || 0.7) * (0.6 + Math.random() * 0.6), col: col || "#fff3a0", r: (opt.r || 3.5) * (0.6 + Math.random() * 0.8), g: opt.g == null ? 260 : opt.g, b: opt.b || board, scr: opt.scr, kind: opt.kind || "dot" });
  }
}
function floatText(x, y, txt, col, opt) { opt = opt || {}; parts.push({ x, y, vx: 0, vy: -46, life: 0, max: opt.life || 1, txt, col: col || "#fff", g: 0, b: opt.b || board, size: opt.size || 18, kind: "text" }); }
function ring(x, y, col, b) { parts.push({ x, y, life: 0, max: 0.45, col, b: b || board, kind: "ring" }); }
function flyIcon(k, fx, fy, tx, ty, opt) { opt = opt || {}; parts.push({ kind: "fly", k, fx, fy, tx, ty, life: -(opt.delay || 0), max: opt.dur || 0.6, b: opt.b || board, scr: opt.scr, size: opt.size || 34, arc: opt.arc == null ? 60 : opt.arc }); }
function arrowFx(x, y, tx, ty, b) { parts.push({ kind: "arrow", fx: x, fy: y, tx, ty, life: 0, max: 0.35, b }); }
function rsOf(c) {
  let r = RS.get(c.id);
  if (!r) { r = { x: c.x, y: c.y, s: 1, fl: 0, sh: 0 }; RS.set(c.id, r); }
  return r;
}
function zOf(c) { let z = Z.get(c.id); if (z == null) { z = zc++; Z.set(c.id, z); } return z; }
function bumpZ(c) { Z.set(c.id, zc++); }

/* ---------- события симуляции ---------- */
const DONE_SND = { r_wood: "chop", r_deadwood: "chop", r_lumber: "chop", r_plank: "chop", r_stone: "stonehit", r_quarry: "stonehit", r_cutstone: "stonehit", r_ore: "mine", r_crystal: "mine", r_breed: "levelup" };
const CAT_SND = { build: "build", craft: "househit", cook: "potion", food: "select", gather: "select", equip: "perk", explore: "open", farm: "heal", nat: "select" };
const nm = (k) => L(CARDS[k].n);
let lastEatSnd = 0, warnedFood = -1;
function viewCenterBottom() { const [x, y] = s2w(W / 2, trayTop - CH * cam.z - 14); return [x, y]; }
function onEvents() {
  const evs = G.ev; G.ev = [];
  for (const e of evs) {
    const here = !e.b || e.b === board;
    switch (e.t) {
      case "pop": {
        const c = G.cards[e.id]; if (!c) break;
        const r = rsOf(c);
        if (c.b === board) {
          r.fly = { fx: e.fx, fy: e.fy, t: 0, d: e.inplace ? 0.25 : 0.5 }; r.s = 0.3;
          if (!e.inplace) ring(e.fx, e.fy + CH / 2, e.enemy ? "#e0604a" : "#ffe7b0");
          if (e.k === "coin") stars(e.fx, e.fy + CH / 2, 3);
          if (e.inplace) burst(c.x, c.y + CH / 2, 18, "#ffe070", { v: 160 });
        }
        bumpZ(S.root(G, c));
        break;
      }
      case "done": {
        if (e.b === board) { burst(e.x, e.y + 20, e.cat === "build" ? 22 : 10, e.cat === "build" ? "#ffe9a0" : "#fff", { v: e.cat === "build" ? 170 : 110 }); play(DONE_SND[e.rec] || CAT_SND[e.cat] || "select", { vol: e.cat === "nat" ? 0.35 : 0.7 }); }
        if (e.cat === "build" || e.cat === "equip") haptic("impact", "medium"); else if (e.b === board) haptic("impact", "light");
        if (e.rec === "r_beacon" && e.b === board) { const bc = Object.values(G.cards).find((c) => c.k === "beacon"); if (bc) { camGoal = { x: bc.x, y: bc.y + CH / 2, t: 1.2 }; setTimeout(() => { burst(bc.x, bc.y + CH / 2, 40, "#ffe9a0", { v: 260, life: 1.2 }); stars(bc.x, bc.y + CH / 2, 14); }, 700); } }
        if (e.disc) { toast("📖 Новый рецепт: " + recName(e.rec), "gold"); flash("bookb"); play("upgrade", { vol: 0.6 }); }
        break;
      }
      case "learn": {
        const [sx, sy] = w2s(e.x, e.y + CH / 2), br = $("bookb").getBoundingClientRect();
        flyIcon(e.k, sx, sy, br.left + br.width / 2, br.top + br.height / 2, { scr: 1, dur: 0.8, size: 44, arc: 90 });
        setTimeout(() => flash("bookb"), 800);
        play("magic", { vol: 0.6 });
        toast(e.isNew ? "💡 " + nm(e.k) : "💡 " + nm(e.k) + " — уже в книге", e.isNew ? "gold" : "");
        break;
      }
      case "deplete": if (here) { burst(e.x, e.y + CH / 2, 16, "#c8b89a", { v: 90, life: 0.6 }); floatText(e.x, e.y, nm(e.k) + ": всё", "#fff", { size: 14 }); } break;
      case "hit": {
        const t = G.cards[e.b];
        if (e.bd === board) {
          if (t) { const r = rsOf(t); r.fl = 1; r.sh = 1; }
          floatText(e.x + (Math.random() - 0.5) * 30, e.y + 20, "−" + e.d, e.foe ? "#fff" : "#ff5a4a", { size: 20 });
          burst(e.x, e.y + CH / 2, 6, e.foe ? "#fff" : "#ff7a6a", { v: 130 });
          play(Math.random() < 0.5 ? "hit" : "hit2", { vol: 0.55, gap: 0.08 });
          shake = Math.max(shake, e.foe ? 3 : 5);
          if (!e.foe) haptic("impact", "light");
        }
        break;
      }
      case "die": {
        if (here) {
          burst(e.x, e.y + CH / 2, 26, e.foe ? "#ffcf6a" : "#ff6a5a", { v: 200, life: 0.9 });
          play(e.foe ? (e.k === "skeleton" ? "bone" : Math.random() < 0.5 ? "die" : "die2") : "hurt", { vol: 0.8 });
          shake = Math.max(shake, 9);
        }
        if (!e.foe) { toast("💀 Погиб: " + nm(e.k), "bad"); haptic("notify", "error"); play("collapse", { vol: 0.5 }); }
        else if (CARDS[e.k].boss) { banner("Курганный князь повержен!", ""); }
        break;
      }
      case "fightend": if (here && e.win) play("confirm", { vol: 0.5 }); break;
      case "ambush": toast("⚠️ Засада: " + nm(e.k) + "!", "bad"); play("growl", { vol: 0.8 }); haptic("notify", "warning"); break;
      case "attacked": if (here) { toast("⚠️ " + nm(e.k) + " нападает!", "bad"); haptic("notify", "warning"); } break;
      case "arrow": if (e.b === board) { arrowFx(e.x, e.y + 20, e.tx, e.ty + 40, e.b); play("arrow", { vol: 0.5 }); } break;
      case "charge": play("whoosh", { vol: 0.7 }); haptic("impact", "medium"); break;
      case "sell": {
        const r = $("sell").getBoundingClientRect();
        burst(r.left + r.width / 2, r.top + 10, 14 + Math.min(20, e.n * 3), "#f6c945", { scr: 1, v: 220, up: 160, r: 5, kind: "coin", life: 0.8 });
        stars(r.left + r.width / 2, r.top + 14, 6, board, 1);
        play("coin2", { vol: 0.8 }); haptic("notify", "success");
        if (e.n) floatText(...s2w(r.left + r.width / 2, r.top - 10), "+" + e.n + " 🪙", "#fff4a0", { size: 22 });
        break;
      }
      case "spend": if (e.b === board) { const [sx, sy] = w2s(e.x, e.y + 20); const pr = $("packs").getBoundingClientRect(); parts.push({ kind: "fly", k: "coin", fx: sx, fy: sy, tx: pr.left + pr.width / 2, ty: pr.top + 30, life: -Math.random() * 0.2, max: 0.5, scr: 1, size: 22, arc: 50 }); } break;
      case "buy": {
        const c = G.cards[e.id]; if (!c) break;
        const r = rsOf(c); const pr = $("packs").getBoundingClientRect(); const [wx, wy] = s2w(pr.left + pr.width / 2, pr.top);
        r.fly = { fx: wx, fy: wy, t: 0, d: 0.55 }; r.s = 0.4; bumpZ(c);
        play("buy", { vol: 0.8 }); haptic("impact", "medium");
        break;
      }
      case "open": if (here) { burst(e.x, e.y + CH / 2, 34, "#ffd0f0", { v: 220, life: 0.9 }); burst(e.x, e.y + CH / 2, 16, "#fff3a0", { v: 160 }); play("open"); play("perk", { vol: 0.6, delay: 0.12 }); haptic("impact", "medium"); } break;
      case "stack": { play("click", { vol: 0.6 }); haptic("impact", "light"); const c = G.cards[e.id]; if (c && c.b === board) { rsOf(c).sq = 1; dust(c.x, c.y + CH, 4); } break; }
      case "bounce": play("error", { vol: 0.5 }); haptic("notify", "error"); break;
      case "drop": { play("click", { vol: 0.25, rate: 0.8 }); const c = G.cards[e.id]; if (c && c.b === board) { rsOf(c).sq = 1; dust(c.x, c.y + S.stackH(G, c), 6); } break; }
      case "night":
        banner("Ночь " + e.day, "Жители ужинают…"); play("gong", { vol: 0.6 }); hideInfo();
        break;
      case "eat": {
        if (e.fb === board && e.pb === board) flyIcon(e.k, e.fx, e.fy + 30, e.px, e.py + 30, { delay: e.delay, dur: 0.45, size: 30 });
        const tnow = performance.now(); if (tnow - lastEatSnd > 90) { lastEatSnd = tnow; setTimeout(() => play("click", { vol: 0.35, rate: 1.4 }), e.delay * 1000 + 400); }
        break;
      }
      case "starve": setTimeout(() => { toast("💀 " + nm(e.k) + " умер от голода", "bad"); play("hurt"); haptic("notify", "error"); if (e.b === board) { burst(e.x, e.y + CH / 2, 22, "#8a7a9a", { v: 120 }); shake = 8; } }, (e.delay || 0) * 1000 + 300); break;
      case "wander": setTimeout(() => { toast("🧳 Пришёл странник — теперь двое: положите обоих на хижину — появится третий", "good", 6); play("bell", { vol: 0.4 }); }, 1800); break;
      case "hold": showHold(); play("error"); haptic("notify", "warning"); break;
      case "dawn": {
        $("hold").classList.add("hidden");
        const ln = G.lastNight;
        banner("День " + e.day, ln && ln.starved ? "Голодали: " + ln.starved : ln ? "Все сыты" : "");
        play("bell", { vol: 0.6 }); warnedFood = -1;
        St.event("day", { d: e.day, pop: S.popCount(G) });
        save(true);
        break;
      }
      case "threat": {
        const cnt = {}; for (const k of e.ks) cnt[k] = (cnt[k] || 0) + 1;
        const txt = Object.keys(cnt).map((k) => nm(k) + (cnt[k] > 1 ? " ×" + cnt[k] : "")).join(", ");
        if (e.ks.indexOf("boss") >= 0) { setTimeout(() => banner("Курганный князь идёт!", "Собери всех бойцов"), 1600); play("roar2"); music("m_battle2"); }
        setTimeout(() => toast("⚠️ " + (e.b === "home" ? "" : L(BIOMES[e.b].n) + ": ") + "пришли " + txt + (e.weak ? " (частокол ослабил)" : ""), "bad"), 1200);
        setTimeout(() => { play("roar", { vol: 0.7 }); haptic("notify", "warning"); }, 1200);
        break;
      }
      case "boss": banner("Курганный князь пробудился!", ""); play("roar2"); music("m_battle2"); shake = 14; break;
      case "quest": {
        toast("✅ " + L(e.n), "good"); play("levelup", { vol: 0.6 }); haptic("notify", "success");
        const q = $("quest"); q.classList.remove("done"); void q.offsetWidth; q.classList.add("done");
        St.event("quest", { i: e.i, day: G.day });
        break;
      }
      case "unlock": toast("🧭 Открыт край: " + L(BIOMES[e.b].n) + " — перетащи стопку на его вкладку вверху", "gold"); play("perk"); haptic("notify", "success"); buildTabs(); break;
      case "travel": play("whoosh"); break;
      case "win": setTimeout(() => showEnd(true), 1800); music("m_win"); St.gameEnd({ win: 1, how: e.how, day: G.day, pop: S.popCount(G) }); break;
      case "lose": setTimeout(() => showEnd(false), 1400); music("m_lose"); St.gameEnd({ win: 0, day: G.day }); break;
    }
  }
}
function recName(id) { const r = S.RECIPE_BY_ID[id]; if (!r) return id; return L(RNAME[id] || (r.out ? CARDS[r.out[0]].n : id)); }

/* ---------- отрисовка ---------- */
function drawBoard() {
  const B = BIOMES[board];
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  const [x0, y0] = w2s(0, 0), [x1, y1] = w2s(B.w, B.h);
  // столешница (если коврик закрывает весь экран — её не видно, не рисуем)
  const R = 26 * cam.z;
  const covered = x0 <= -R && y0 <= -R && x1 >= W + R && y1 >= Hh + R;
  if (!covered) {
    const wp = pattern("wood");
    try { wp.setTransform(new DOMMatrix([cam.z * 0.9, 0, 0, cam.z * 0.9, x0, y0])); } catch (_) {}
    ctx.fillStyle = wp; ctx.fillRect(0, 0, W, Hh);
  }
  // мягкая тень коврика (без shadowBlur — несколько полупрозрачных слоёв)
  if (!covered) for (let i = 3; i >= 1; i--) { const e = i * 5 * cam.z; rr(ctx, x0 - e * 0.6, y0 - e * 0.2 + 4 * cam.z, x1 - x0 + e * 1.2, y1 - y0 + e * 1.1, R + e); ctx.fillStyle = "rgba(30,14,4,.13)"; ctx.fill(); }
  // войлочный коврик
  const p = pattern(board);
  try { p.setTransform(new DOMMatrix([cam.z, 0, 0, cam.z, x0, y0])); } catch (_) {}
  rr(ctx, x0, y0, x1 - x0, y1 - y0, R); ctx.fillStyle = p; ctx.fill();
  // кромка и строчка
  ctx.lineWidth = Math.max(1, 3 * cam.z); ctx.strokeStyle = "rgba(40,22,8,.35)"; ctx.stroke();
  const ins = 14 * cam.z;
  rr(ctx, x0 + ins, y0 + ins, x1 - x0 - ins * 2, y1 - y0 - ins * 2, Math.max(2, R - ins * 0.6));
  ctx.setLineDash([9 * cam.z, 6 * cam.z]); ctx.lineWidth = Math.max(1, 1.8 * cam.z); ctx.strokeStyle = "rgba(255,244,214,.38)"; ctx.stroke(); ctx.setLineDash([]);
}
function heart(c, x, y, s) { c.beginPath(); c.moveTo(x, y + s * 0.9); c.bezierCurveTo(x - s * 1.6, y - s * 0.1, x - s * 0.7, y - s * 1.2, x, y - s * 0.35); c.bezierCurveTo(x + s * 0.7, y - s * 1.2, x + s * 1.6, y - s * 0.1, x, y + s * 0.9); c.fill(); }
const EGLOW = radial([[0, "rgba(220,60,40,.55)"], [0.5, "rgba(200,50,30,.2)"], [1, "rgba(200,40,20,0)"]], 64);
const BGLOW = radial([[0, "rgba(170,90,255,.6)"], [0.5, "rgba(140,70,230,.22)"], [1, "rgba(120,60,220,0)"]], 64);
function drawCard(c, sc, opt) {
  const r = rsOf(c), d = CARDS[c.k];
  const anim = ANIM[c.k] && !c.up && !(opt && opt.still);
  const spr = sprite(c.k, sc, anim);
  let x = r.x, y = r.y, s = r.s;
  if (r.sh > 0) { x += (Math.random() - 0.5) * 8 * r.sh; y += (Math.random() - 0.5) * 6 * r.sh; }
  if (d.c === "enemy" && !c.cb) y += Math.sin(clock * 4 + c.id) * 2;
  ctx.save();
  ctx.translate(x, y + CH / 2);
  if (opt && opt.rot) ctx.rotate(opt.rot);
  if (s !== 1) ctx.scale(s, s);
  if (r.sq > 0) { const q = Math.sin(r.sq * Math.PI) * 0.09 * r.sq; ctx.translate(0, CH / 2); ctx.scale(1 + q, 1 - q); ctx.translate(0, -CH / 2); }
  ctx.translate(-CW / 2, -CH / 2);
  if (d.c === "enemy") { const g = d.boss ? BGLOW : EGLOW, e = (d.boss ? 30 : 18) + Math.sin(clock * 4 + c.id) * 4; ctx.drawImage(g, -e, -e, CW + e * 2, CH + e * 2); }
  ctx.drawImage(spr, -PAD, -PAD, CW + PAD * 2, CH + PAD * 2);
  if (anim) drawAnimIcon(c, sc);
  if (r.fl > 0) { rr(ctx, 0, 0, CW, CH, 9); ctx.fillStyle = `rgba(255,250,235,${r.fl * 0.75})`; ctx.fill(); }
  if (c.id === selected) { rr(ctx, -3.5, -3.5, CW + 7, CH + 7, 12); ctx.lineWidth = 3; ctx.strokeStyle = "rgba(255,214,120,.95)"; ctx.stroke(); }
  // живые значки
  ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.font = `900 10px ${FONT}`;
  if (d.hp && (d.c === "person" || d.c === "enemy")) {
    const hp = Math.max(0, c.hp), mx = c.mhp || d.hp;
    ctx.fillStyle = "#c8423a"; heart(ctx, CW - 12, CH - 10, 5);
    ctx.fillStyle = INK; ctx.textAlign = "right"; ctx.fillText(String(hp), CW - 19.5, CH - 9); ctx.textAlign = "center";
    if (hp < mx || c.cb) { rr(ctx, 8, CH - 25, CW - 16, 5, 2.5); ctx.fillStyle = "rgba(59,38,24,.45)"; ctx.fill(); rr(ctx, 8, CH - 25, (CW - 16) * Math.max(0, hp / mx), 5, 2.5); ctx.fillStyle = d.c === "enemy" ? "#d4553f" : "#7cb24a"; ctx.fill(); }
  }
  if (d.f != null && d.c === "food") {
    const f = c.f == null ? d.f : c.f;
    const ft = (f < d.f ? f + "/" : "") + d.f, fw = ctx.measureText(ft).width;
    drawIcon(ctx, "bowl", 4, CH - 16.5, 13);
    ctx.fillStyle = INK; ctx.textAlign = "left"; ctx.fillText(ft, 18, CH - 9); ctx.textAlign = "center";
  }
  if (c.u != null && d.u) { rr(ctx, CW - 25, 27, 19, 13, 6.5); ctx.fillStyle = "rgba(255,248,232,.92)"; ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = "rgba(59,38,24,.5)"; ctx.stroke(); ctx.fillStyle = INK; ctx.fillText("×" + c.u, CW - 15.5, 33.8); }
  if (c.k === "hut" && c.br === G.day) { rr(ctx, CW - 25, 27, 19, 13, 6.5); ctx.fillStyle = "rgba(255,248,232,.92)"; ctx.fill(); ctx.fillStyle = "#5b4268"; ctx.fillText("zZ", CW - 15.5, 33.8); }
  if (d.c === "pack") { const k = 0.5 + 0.5 * Math.sin(clock * 3 + c.id); ctx.globalAlpha = 0.2 + 0.35 * k; rr(ctx, -2, -2, CW + 4, CH + 4, 11); ctx.lineWidth = 3.5; ctx.strokeStyle = "#ffe9a8"; ctx.stroke(); ctx.globalAlpha = 1; }
  ctx.restore();
}
// анимированная иконка поверх окна карты
function drawAnimIcon(c, sc) {
  const kind = ANIM[c.k], isp = iconSprite(c.k, sc), ph = c.id * 1.7;
  const ix = (CW - 52) / 2 - 4, iy = 25.5 - 4;
  ctx.save();
  rr(ctx, 5, 24, CW - 10, CH - 43, 7); ctx.clip();
  if (kind === "sway") {
    const a = Math.sin(clock * 1.5 + ph) * 0.035 + Math.sin(clock * 3.7 + ph) * 0.01;
    ctx.translate(CW / 2, 76); ctx.rotate(a); ctx.translate(-CW / 2, -76);
    ctx.drawImage(isp, ix, iy, 60, 60);
  } else if (kind === "fire") {
    const fl = 1 + Math.sin(clock * 11 + ph) * 0.035 + Math.sin(clock * 17.3 + ph) * 0.025;
    ctx.save(); ctx.translate(CW / 2, 74); ctx.scale(1 / Math.sqrt(fl), fl); ctx.translate(-CW / 2, -74);
    ctx.drawImage(isp, ix, iy, 60, 60); ctx.restore();
    ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = 0.28 + 0.12 * Math.sin(clock * 9 + ph);
    ctx.drawImage(GLOW, CW / 2 - 30, 30, 60, 50);
  } else if (kind === "glow") {
    ctx.drawImage(isp, ix, iy, 60, 60);
    ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = 0.18 + 0.12 * Math.sin(clock * 2.4 + ph);
    ctx.drawImage(GLOW, CW / 2 - 26, 28, 52, 46);
  } else { ctx.translate(0, Math.sin(clock * 2 + ph) * 1.2); ctx.drawImage(isp, ix, iy, 60, 60); }
  ctx.restore();
}
function coinBadge(c, n) {
  const r = rsOf(c); const x = r.x + CW / 2 - 6, y = r.y + 6;
  ctx.font = `900 13px ${FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  const w = ctx.measureText(String(n)).width + 14;
  rr(ctx, x - w / 2, y - 9.5, w, 19, 9.5); ctx.fillStyle = "#4a2e1a"; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = "#e9b949"; ctx.stroke();
  ctx.fillStyle = "#ffe08a"; ctx.fillText(String(n), x, y + 0.5);
}
const LOOK_ICON = { forest: "forest", cave: "cave", shore: "shore", pass: "pass", ruins: "ruins" };
function drawProgress(r) {
  const info = S.stackInfo(G, r); if (!info) return;
  const rs = rsOf(r);
  const x = rs.x - CW / 2, y = rs.y - 18, w = CW;
  rr(ctx, x + 10, y, w - 8, 12, 6); ctx.fillStyle = "rgba(255,246,226,.95)"; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = "rgba(59,38,24,.75)"; ctx.stroke();
  const p = Math.min(1, r.rt / r.rT);
  rr(ctx, x + 12.5, y + 2.5, Math.max(7, (w - 13) * p), 7, 3.5);
  ctx.fillStyle = info.rec.cat === "breed" ? "#e48aa8" : info.rec.cat === "explore" ? "#6fb0b0" : "#e9a945"; ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,.35)"; ctx.fillRect(x + 14, y + 3, Math.max(4, (w - 17) * p), 2);
  // кольцо с иконкой результата
  ctx.beginPath(); ctx.arc(x + 6, y + 6, 12, 0, 6.283); ctx.fillStyle = "#fff6e2"; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = "rgba(59,38,24,.75)"; ctx.stroke();
  ctx.beginPath(); ctx.arc(x + 6, y + 6, 12, -1.571, -1.571 + p * 6.283); ctx.lineWidth = 3; ctx.strokeStyle = "#c9672f"; ctx.stroke();
  const rec = info.rec;
  const ic = rec.out ? rec.out[0] : typeof rec.lo === "string" ? LOOK_ICON[rec.lo] || "map" : rec.lo[0][0];
  drawIcon(ctx, ic, x - 4, y - 4, 20);
}
function drawFight(f) {
  if (f.rx0 == null) return;
  const x = f.rx0, y = f.ry0, w = f.rx1 - f.rx0, h = f.ry1 - f.ry0;
  ctx.save();
  rr(ctx, x - 6, y - 6, w + 12, h + 12, 20); ctx.fillStyle = "rgba(120,40,20,.10)"; ctx.fill();
  rr(ctx, x, y, w, h, 16); ctx.fillStyle = "rgba(255,236,214,.22)"; ctx.fill();
  ctx.setLineDash([10, 7]); ctx.lineDashOffset = -clock * 18; ctx.lineWidth = 2.5; ctx.strokeStyle = "rgba(168,58,40,.75)"; ctx.stroke(); ctx.setLineDash([]);
  // разделитель и медальон со скрещёнными мечами
  const my = f.y - 4;
  ctx.strokeStyle = "rgba(168,58,40,.35)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + 18, my); ctx.lineTo(x + w - 18, my); ctx.stroke();
  ctx.beginPath(); ctx.arc(f.x, my, 14, 0, 6.283); ctx.fillStyle = "#fff4e0"; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = "#a83a28"; ctx.stroke();
  ctx.translate(f.x, my); ctx.strokeStyle = "#5b3b25"; ctx.lineWidth = 2.4; ctx.lineCap = "round";
  for (const sg of [1, -1]) { ctx.save(); ctx.rotate(sg * 0.785); ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(0, 7); ctx.moveTo(-3.5, 4); ctx.lineTo(3.5, 4); ctx.stroke(); ctx.restore(); }
  ctx.restore();
}
function drawParts(dt, screen) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    if (!!p.scr !== screen || p.kind === "firefly") continue;
    if (!screen && p.b !== board) { parts.splice(i, 1); continue; }
    p.life += dt;
    if (p.life > p.max) { parts.splice(i, 1); continue; }
    if (p.life < 0) continue;
    const k = p.life / p.max;
    if (p.kind === "dot" || p.kind === "coin") {
      p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      ctx.globalAlpha = 1 - k * k;
      if (p.kind === "coin") { ctx.fillStyle = "#c98f1c"; ctx.beginPath(); ctx.ellipse(p.x, p.y, p.r, p.r * (0.5 + 0.5 * Math.abs(Math.sin(p.life * 12))), 0, 0, 6.283); ctx.fill(); ctx.fillStyle = "#ffe08a"; ctx.beginPath(); ctx.arc(p.x - p.r * 0.2, p.y - p.r * 0.2, p.r * 0.4, 0, 6.283); ctx.fill(); }
      else { ctx.fillStyle = p.col; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1 - k * 0.5), 0, 6.283); ctx.fill(); }
      ctx.globalAlpha = 1;
    } else if (p.kind === "dust" || p.kind === "smoke") {
      p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.96; if (p.kind === "smoke") p.vx += Math.sin(clock * 1.3 + p.ph) * 6 * dt;
      const rad = p.r * (1 + k * (p.kind === "smoke" ? 2.2 : 1.4));
      ctx.globalAlpha = (p.kind === "smoke" ? 0.32 : 0.5) * (1 - k) * Math.min(1, p.life * 8);
      ctx.drawImage(p.img, p.x - rad, p.y - rad, rad * 2, rad * 2);
      ctx.globalAlpha = 1;
    } else if (p.kind === "spark") {
      p.x += p.vx * dt + Math.sin(clock * 8 + p.ph) * 0.3; p.y += p.vy * dt;
      ctx.globalAlpha = 1 - k; ctx.fillStyle = k < 0.4 ? "#ffe39a" : "#ff9a3c"; ctx.fillRect(p.x - 1, p.y - 1, 2.2, 2.2); ctx.globalAlpha = 1;
    } else if (p.kind === "leaf") {
      p.x += (p.vx + Math.sin(clock * 1.6 + p.ph) * 18) * dt; p.y += p.vy * dt; p.a += p.va * dt;
      ctx.globalAlpha = Math.min(1, p.life * 2, (1 - k) * 3) * 0.85;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.scale(1, Math.abs(Math.cos(p.a * 1.3)) * 0.7 + 0.3);
      ctx.fillStyle = p.col; ctx.beginPath(); ctx.moveTo(-p.r, 0); ctx.quadraticCurveTo(0, -p.r * 0.7, p.r, 0); ctx.quadraticCurveTo(0, p.r * 0.7, -p.r, 0); ctx.fill();
      ctx.restore(); ctx.globalAlpha = 1;
    } else if (p.kind === "star") {
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 120 * dt;
      const s = p.r * Math.sin(k * Math.PI);
      ctx.globalAlpha = 1 - k * 0.6; ctx.fillStyle = "#fff3b0";
      ctx.beginPath(); ctx.moveTo(p.x, p.y - s); ctx.quadraticCurveTo(p.x, p.y, p.x + s, p.y); ctx.quadraticCurveTo(p.x, p.y, p.x, p.y + s); ctx.quadraticCurveTo(p.x, p.y, p.x - s, p.y); ctx.quadraticCurveTo(p.x, p.y, p.x, p.y - s); ctx.fill();
      ctx.globalAlpha = 1;
    } else if (p.kind === "text") {
      p.y += p.vy * dt; p.vy *= 0.97;
      ctx.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
      ctx.font = `900 ${p.size}px ${FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.lineWidth = 4; ctx.lineJoin = "round"; ctx.strokeStyle = "rgba(59,38,24,.85)"; ctx.strokeText(p.txt, p.x, p.y); ctx.fillStyle = p.col; ctx.fillText(p.txt, p.x, p.y);
      ctx.globalAlpha = 1;
    } else if (p.kind === "ring") {
      ctx.globalAlpha = 1 - k; ctx.lineWidth = 4 * (1 - k) + 1; ctx.strokeStyle = p.col; ctx.beginPath(); ctx.arc(p.x, p.y, 20 + k * 70, 0, 6.283); ctx.stroke(); ctx.globalAlpha = 1;
    } else if (p.kind === "fly") {
      const e = 1 - Math.pow(1 - k, 3);
      const x = p.fx + (p.tx - p.fx) * e, y = p.fy + (p.ty - p.fy) * e - Math.sin(k * Math.PI) * p.arc;
      const s = p.size * (1 - 0.35 * k);
      ctx.globalAlpha = k > 0.85 ? (1 - k) / 0.15 : 1;
      drawIcon(ctx, p.k, x - s / 2, y - s / 2, s);
      ctx.globalAlpha = 1;
    } else if (p.kind === "arrow") {
      const x = p.fx + (p.tx - p.fx) * k, y = p.fy + (p.ty - p.fy) * k - Math.sin(k * Math.PI) * 40;
      const a = Math.atan2(p.ty - p.fy, p.tx - p.fx);
      ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.fillStyle = "#6b4a2b"; ctx.fillRect(-14, -1.5, 22, 3); ctx.fillStyle = "#c9d2d8"; ctx.beginPath(); ctx.moveTo(8, -4); ctx.lineTo(14, 0); ctx.lineTo(8, 4); ctx.fill(); ctx.restore();
    }
  }
}
// светлячки: рисуются поверх темноты, светятся сами
function drawFireflies(dt, amt) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    if (p.kind !== "firefly") continue;
    if (p.b !== board) { parts.splice(i, 1); continue; }
    p.life += dt;
    if (p.life > p.max) { parts.splice(i, 1); continue; }
    p.a += (Math.sin(clock * 0.7 + p.ph) * 1.6) * dt;
    p.x += Math.cos(p.a) * 14 * dt; p.y += Math.sin(p.a) * 10 * dt;
    const k = p.life / p.max, tw = 0.5 + 0.5 * Math.sin(clock * 3 + p.ph * 3);
    const al = Math.min(1, p.life, (p.max - p.life)) * amt * (0.35 + 0.65 * tw);
    if (al <= 0.02) continue;
    ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = al * 0.55;
    ctx.drawImage(GLOW, p.x - 13, p.y - 13, 26, 26);
    ctx.globalAlpha = al; ctx.fillStyle = "#fff6b8"; ctx.beginPath(); ctx.arc(p.x, p.y, 1.7, 0, 6.283); ctx.fill();
    ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
  }
}
const SMOKE = radial([[0, "rgba(236,228,214,.9)"], [0.6, "rgba(220,210,196,.45)"], [1, "rgba(220,210,196,0)"]], 32);
const DUST = radial([[0, "rgba(214,186,140,.85)"], [0.6, "rgba(200,170,120,.4)"], [1, "rgba(200,170,120,0)"]], 32);
function dust(x, y, n) {
  for (let i = 0; i < n; i++) { const s = i % 2 ? 1 : -1; parts.push({ kind: "dust", img: DUST, x: x + s * (8 + Math.random() * 26), y: y - Math.random() * 4, vx: s * (30 + Math.random() * 50), vy: -8 - Math.random() * 16, r: 5 + Math.random() * 4, life: 0, max: 0.5 + Math.random() * 0.3, b: board }); }
}
function stars(x, y, n, b, scr) { for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, v = 50 + Math.random() * 90; parts.push({ kind: "star", x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, r: 4 + Math.random() * 4, life: 0, max: 0.5 + Math.random() * 0.4, b: b || board, scr }); } }
// живой фон: дым, искры, листья, светлячки
const EMIT = { hut: [6.5, 38, 0.45, "smoke"], kitchen: [10, 27, 0.8, "smoke"], smithy: [-12, 44, 1.6, "spark"], campfire: [-1.5, 44, 4, "spark"] };
function ambient(dt, vis, night, dusk) {
  if (parts.length > 240) return;
  for (const c of vis) {
    const e = EMIT[c.k]; if (!e) continue;
    const r = rsOf(c);
    if (Math.random() < e[2] * dt) {
      if (e[3] === "smoke") parts.push({ kind: "smoke", img: SMOKE, x: r.x + e[0], y: r.y + e[1], vx: 4 + Math.random() * 6, vy: -16 - Math.random() * 10, r: 4 + Math.random() * 2, ph: Math.random() * 6, life: 0, max: 2.4 + Math.random(), b: board });
      else parts.push({ kind: "spark", x: r.x + e[0] + (Math.random() - 0.5) * 10, y: r.y + e[1], vx: (Math.random() - 0.5) * 14, vy: -30 - Math.random() * 30, ph: Math.random() * 6, life: 0, max: 0.8 + Math.random() * 0.6, b: board });
    }
    if (c.k === "campfire" && Math.random() < 0.7 * dt) parts.push({ kind: "smoke", img: SMOKE, x: r.x - 2, y: r.y + 34, vx: 3, vy: -18, r: 4, ph: Math.random() * 6, life: 0, max: 2.2, b: board });
  }
  const [vx0, vy0] = s2w(0, 0), [vx1, vy1] = s2w(W, Hh);
  if ((board === "home" || board === "haunted") && night < 0.3 && Math.random() < (board === "home" ? 0.3 : 0.5) * dt * Math.min(2, W / 500)) {
    const cols = board === "home" ? ["#c98f3a", "#d4a24a", "#b8642f", "#9aa84a"] : ["#8a7a5a", "#6a6a52", "#9a8a6a"];
    parts.push({ kind: "leaf", x: vx0 + Math.random() * (vx1 - vx0), y: vy0 + 40 / cam.z, vx: 12 + Math.random() * 14, vy: 26 + Math.random() * 18, a: Math.random() * 6, va: (Math.random() - 0.5) * 3, r: 5 + Math.random() * 2.5, col: cols[Math.floor(Math.random() * cols.length)], ph: Math.random() * 6, life: 0, max: (vy1 - vy0) / 30, b: board });
  }
  const ff = Math.max(night, dusk * 1.6);
  if (ff > 0.15 && board !== "mountains") {
    let n = 0; for (const p of parts) if (p.kind === "firefly") n++;
    const want = Math.round(14 * Math.min(1, ff) * Math.min(1.6, (vx1 - vx0) * (vy1 - vy0) / 400000));
    if (n < want && Math.random() < 3 * dt) parts.push({ kind: "firefly", x: vx0 + Math.random() * (vx1 - vx0), y: vy0 + (vy1 - vy0) * (0.2 + Math.random() * 0.65), a: Math.random() * 6.28, ph: Math.random() * 6, life: 0, max: 6 + Math.random() * 6, b: board });
  }
}
// источники света: [радиус, сила]
const LIGHTS = { campfire: [210, 1, 1], kitchen: [150, 0.85, 1], smithy: [150, 0.85, 1], hut: [105, 0.7, 0], beacon: [420, 1.2, 0], tower: [95, 0.6, 1], explorer: [110, 0.75, 0], lantern: [90, 0.7, 0], market: [85, 0.5, 0] };
function tintAlpha() {
  if (!G) return [0, 0];
  if (G.ph === "night" || G.ph === "hold") return [0.66, 0];
  const p = G.t / DAY_LEN;
  const night = p > 0.78 ? (p - 0.78) / 0.22 * 0.6 : p < 0.04 && G.day > 1 ? (0.04 - p) / 0.04 * 0.6 : 0;
  const dusk = p > 0.58 ? Math.sin(Math.min(1, (p - 0.58) / 0.4) * Math.PI) * 0.42 : 0;
  return [night, dusk];
}
function drawLighting(na, da, lights) {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  if (da > 0.03) { ctx.globalCompositeOperation = "multiply"; ctx.fillStyle = `rgba(255,168,104,${da})`; ctx.fillRect(0, 0, W, Hh); ctx.globalCompositeOperation = "source-over"; }
  if (na <= 0.01) return;
  const lw = Math.max(1, Math.ceil(W / 4)), lh = Math.max(1, Math.ceil(Hh / 4));
  if (LM.width !== lw || LM.height !== lh) { LM.width = lw; LM.height = lh; }
  lctx.globalCompositeOperation = "source-over"; lctx.globalAlpha = 1; lctx.clearRect(0, 0, lw, lh);
  lctx.fillStyle = `rgba(18,20,50,${na})`; lctx.fillRect(0, 0, lw, lh);
  lctx.globalCompositeOperation = "destination-out";
  for (const L0 of lights) {
    const rad = L0.r * cam.z / 4;
    lctx.globalAlpha = Math.min(1, L0.s * 0.95);
    lctx.drawImage(LIGHT, L0.x / 4 - rad, L0.y / 4 - rad, rad * 2, rad * 2);
  }
  lctx.globalCompositeOperation = "source-over"; lctx.globalAlpha = 1;
  ctx.drawImage(LM, 0, 0, lw * 4, lh * 4);
  // тёплое свечение вокруг огня
  ctx.globalCompositeOperation = "lighter";
  let ng = 0;
  for (const L0 of lights) { if (!L0.f || ng++ > 8) continue; const rad = L0.r * cam.z * 0.75; ctx.globalAlpha = Math.min(0.3, na * 0.45 * L0.s); ctx.drawImage(GLOW, L0.x - rad, L0.y - rad, rad * 2, rad * 2); }
  ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
}
let fps = 60, fpsAcc = 0, fpsN = 0, rt = 0;
function render(dt) {
  clock += dt;
  drawBoard();
  if (!G) return;
  const sc = bucket();
  // камера с тряской
  const shx = shake > 0 ? (Math.random() - 0.5) * shake : 0, shy = shake > 0 ? (Math.random() - 0.5) * shake : 0;
  shake = Math.max(0, shake - dt * 30);
  ctx.setTransform(DPR * cam.z, 0, 0, DPR * cam.z, DPR * (W / 2 - cam.x * cam.z + shx), DPR * (Hh / 2 - cam.y * cam.z + shy));
  // сглаживание позиций
  const kk = 1 - Math.exp(-dt * 16);
  const [vx0, vy0] = s2w(-120, -160), [vx1, vy1] = s2w(W + 120, Hh + 60);
  const roots = [], fighters = [], enemies = [], tops = [], lights = [];
  const [na, da] = tintAlpha();
  const dragRoot = drag ? drag.root : null;
  for (const id in G.cards) {
    const c = G.cards[id];
    if (c.b !== board) { RS.delete(c.id); continue; }
    const r = rsOf(c);
    let tx = c.x, ty = c.y;
    if (dragRoot && target && drag.snap && S.root(G, c) === dragRoot) { tx += drag.snap[0]; ty += drag.snap[1]; }
    if (r.fly) {
      r.fly.t += dt; const k = Math.min(1, r.fly.t / r.fly.d);
      const e = 1 - Math.pow(1 - k, 3);
      r.x = r.fly.fx + (tx - r.fly.fx) * e; r.y = r.fly.fy + (ty - r.fly.fy) * e - Math.sin(k * Math.PI) * 70;
      r.s = 0.3 + 0.7 * backOut(k);
      if (k >= 1) { r.fly = null; r.s = 1; r.sq = 0.8; }
    } else {
      const fast = dragRoot && S.root(G, c) === dragRoot ? 1 - Math.exp(-dt * 30) : kk;
      r.x += (tx - r.x) * fast; r.y += (ty - r.y) * fast;
      if (Math.abs(tx - r.x) < 0.3) r.x = tx; if (Math.abs(ty - r.y) < 0.3) r.y = ty;
    }
    r.fl = Math.max(0, r.fl - dt * 4); r.sh = Math.max(0, r.sh - dt * 4); if (r.sq) r.sq = Math.max(0, r.sq - dt * 3.2);
    const inV = r.x > vx0 - CW && r.x < vx1 + CW && r.y + CH > vy0 && r.y < vy1;
    if (inV) {
      if (!c.up && EMIT[c.k]) tops.push(c);
      const L0 = (na > 0.01) && LIGHTS[c.k];
      if (L0 && lights.length < 28) { const [sx, sy] = w2s(r.x, r.y + CH / 2); lights.push({ x: sx, y: sy, r: L0[0] * (L0[2] ? 1 + Math.sin(clock * 9 + c.id) * 0.04 + Math.sin(clock * 23 + c.id) * 0.03 : 1), s: L0[1], f: L0[2] || c.k === "beacon" }); }
    }
    if (c.dn) continue;
    if (c.cb) fighters.push(c);
    else if (CARDS[c.k].c === "enemy") enemies.push(c);
    else if (c !== dragRoot) roots.push(c);
  }
  roots.sort((a, b) => zOf(a) - zOf(b));
  const visible = (c, h) => { const r = rsOf(c); return r.x > vx0 - CW && r.x < vx1 + CW && r.y + h > vy0 && r.y < vy1; };
  // тени стопок
  const sh = shadowSprite();
  ctx.globalAlpha = 0.5;
  for (const r of roots) { const h = r.h || CH; if (!visible(r, h)) continue; const rs = rsOf(r); ctx.drawImage(sh, rs.x - CW / 2 - 13, rs.y - 6, CW + 26, h + 24); }
  ctx.globalAlpha = 1;
  // бои — под картами, чтобы зона читалась как площадка
  for (const id in G.fights) { const f = G.fights[id]; if (f.b !== board) continue; drawFight(f); }
  // цель для броска
  if (drag && target) {
    const tr = target.c.cb ? null : S.root(G, target.c);
    if (tr) { const top = S.topOf(G, tr), rs = rsOf(top); ctx.save(); rr(ctx, rs.x - CW / 2 - 5, rs.y - 5, CW + 10, CH + 10, 13); ctx.lineWidth = 4; ctx.strokeStyle = target.bad ? "rgba(200,70,50,.9)" : `rgba(255,214,120,${0.6 + 0.4 * Math.sin(clock * 10)})`; ctx.stroke(); ctx.restore(); }
  }
  drawHintWorld();
  for (const r of roots) {
    const h = r.h || CH;
    if (!visible(r, h)) continue;
    const ch = S.chain(G, r);
    if (r.k === "coin" && ch.length > 11) { for (let i = 0; i < 10; i++) drawCard(ch[i], sc); drawCard(ch[ch.length - 1], sc); coinBadge(ch[ch.length - 1], ch.length); }
    else for (const c of ch) drawCard(c, sc);
  }
  for (const r of roots) if (r.rc && visible(r, CH)) drawProgress(r);
  for (const c of fighters) { ctx.globalAlpha = 0.45; const rs = rsOf(c); ctx.drawImage(sh, rs.x - CW / 2 - 12, rs.y - 6, CW + 24, CH + 22); ctx.globalAlpha = 1; drawCard(c, sc); }
  for (const c of enemies) drawCard(c, sc);
  if (dragRoot && G.cards[dragRoot.id]) {
    const r = dragRoot, rs = rsOf(r);
    const h = S.stackH(G, r);
    ctx.globalAlpha = 0.42; ctx.drawImage(sh, rs.x - CW / 2 - 10, rs.y + 14, CW + 36, h + 40); ctx.globalAlpha = 1;
    const rot = Math.max(-0.12, Math.min(0.12, drag.vx * 0.0006));
    for (const c of S.chain(G, r)) { const q = rsOf(c); q.s = 1.06; drawCard(c, sc, { rot }); q.s = 1; }
  }
  ambient(dt, tops, na, da);
  drawParts(dt, false);
  // вечер и ночь: тёплые островки света
  drawLighting(na, da, lights);
  ctx.setTransform(DPR * cam.z, 0, 0, DPR * cam.z, DPR * (W / 2 - cam.x * cam.z + shx), DPR * (Hh / 2 - cam.y * cam.z + shy));
  drawFireflies(dt, Math.min(1, Math.max(na * 1.5, da * 2.5)));
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  drawParts(dt, true);
  drawHintHand(dt);
  if (DEV) { fpsAcc += dt; fpsN++; if (fpsAcc > 0.5) { fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; } ctx.fillStyle = "#fff"; ctx.font = "12px monospace"; ctx.textAlign = "left"; ctx.fillText(fps.toFixed(0) + " fps " + Object.keys(G.cards).length + " " + rt.toFixed(1) + "ms", 12, Hh - 130); }
}
const backOut = (k) => { const s = 1.7; k -= 1; return k * k * ((s + 1) * k + s) + 1; };

/* ---------- подсказки к целям: рука показывает, что куда перетащить ---------- */
let idleT = 0, hintShown = 0, hintRest = 0, hint = null, hintCalcT = 0, hintClock = 0;
function userActed() { idleT = 0; hintShown = 0; hintRest = 0; hint = null; hintCalcT = 0; }
const isWk = (k) => (CARDS[k].tg || []).indexOf("w") >= 0;
function rootsHere() { return S.roots(G, board).filter((r) => !r.cb && !r.drag && CARDS[r.k].c !== "enemy"); }
// карта вида k (или подходящая под проверку), которую можно взять одной: верх стопки
function looseCard(test, excl) {
  let best = null, bs = -1;
  for (const r of rootsHere()) {
    const ch = S.chain(G, r), top = ch[ch.length - 1];
    if (excl && excl.has(top.id)) continue;
    if (!test(top.k)) continue;
    // лучше одиночная карта или стопка одинаковых, которая не работает
    const score = (ch.length === 1 ? 3 : ch.every((q) => q.k === top.k) ? 2 : 0) + (r.rc ? 0 : 1);
    if (score > bs) { bs = score; best = top; }
  }
  return best;
}
const RAW_SRC = { wood: "r_wood", stone: "r_stone", berry: "r_berry", plank: "r_plank", fiber: "r_fiber", rope: "r_rope", cutstone: "r_cutstone", clay: "r_clay", brick: "r_brick", coal: "r_coal", ore: "r_ore", iron: "r_iron", crystal: "r_crystal", mushroom: "r_mush", fish: "r_fish", campfire: "r_campfire", smithy: "r_smithy", hut: "r_hut", lantern: "r_lantern", explorer: "e_lantern", map: "x_cave", relic: "x_ruins" };
const NAT_PACK = { tree: "pk_forest", bush: "pk_forest", grass: "pk_forest", rock: "pk_stone", claypit: "pk_stone", forest: "pk_explore", cave: "pk_explore" };
// где искать идею рецепта: набор, где она гарантирована первой, иначе — где она чаще всего
const IDEA_PACK = {}; { const best = {};
  for (const p of PACKS) { const tot = p.t.reduce((a, e) => a + e[1], 0); for (const [k, w] of p.t) { if (!CARDS[k] || CARDS[k].c !== "idea") continue; const sc = (p.first && p.first.indexOf(k) >= 0 ? 10 : 0) + w / tot; const r = CARDS[k].rec; if (!best[r] || sc > best[r]) { best[r] = sc; IDEA_PACK[r] = p.k; } } } }
const ideaPack = (r) => (G.kn[r] || !IDEA_PACK[r] ? null : packHint(IDEA_PACK[r]));
function sellHint() {
  let c = null;
  const spare = S.foodSafe(G) > S.foodNeed(G) + 2;
  for (const k0 of ["bone", "nugget", "apple", "wood", "stone", "fiber", "clay", "berry", "mushroom"]) { if (!spare && CARDS[k0].c === "food") continue; c = looseCard((k) => k === k0); if (c) break; }
  c = c || looseCard((k) => CARDS[k].v > 0 && CARDS[k].c !== "build" && CARDS[k].c !== "nature" && CARDS[k].c !== "person");
  return c ? { from: c, el: $("sell") } : null;
}
function packHint(k) {
  const p = PACKS.find((q) => q.k === k); if (!p || S.packLocked(G, p)) return null;
  if (S.coins(G) < p.cost) return sellHint();   // сначала заработать на набор
  const el = document.querySelector(`.pack[data-k="${k}"]`); return el ? { el, tap: 1 } : null;
}
function recipeHint(id, depth) {
  depth = depth || 0;
  const rec = S.RECIPE_BY_ID[id]; if (!rec || depth > 3) return null;
  if (S.roots(G, board).some((r) => r.rc === id)) return null; // уже делается
  const need = []; let wn = 0;
  for (const tk of rec.need) { if (tk === "@w") wn++; else if (tk !== "?@w") need.push(tk.replace(/^[=~]/, "")); }
  const fixed = rec.need.filter((tk) => tk[0] === "=" || tk[0] === "~").map((tk) => tk.slice(1));
  // основа — стопка, которая уже целиком часть рецепта (лучше самая полная и с «постоянной» картой)
  const fits = (ch) => { const left = {}; for (const k of need) left[k] = (left[k] || 0) + 1; let ws = 0; for (const c of ch) { if (left[c.k]) left[c.k]--; else if (isWk(c.k) && ws < wn) ws++; else return -1; } return ch.length; };
  let base = null, bs = -1;
  for (const r of rootsHere()) {
    if (r.rc && r.rc !== id) continue;
    if (id === "r_breed" && r.k === "hut" && r.br === G.day) continue; // хижина уже «спала» сегодня
    const ch = S.chain(G, r), n = fits(ch); if (n < 0) continue;
    if (fixed.length && !ch.some((c) => c.k === fixed[0])) { if (fixed.length) continue; }
    const sc = n * 2 + (ch.length === 1 && !isWk(r.k) ? 1 : 0);
    if (sc > bs) { bs = sc; base = r; }
  }
  if (!base) return missHint(fixed[0] || need[0] || "villager", depth);
  const br = base, ch = S.chain(G, br);
  const left = {}; for (const k of need) left[k] = (left[k] || 0) + 1;
  let ws = 0;
  for (const c of ch) { if (left[c.k]) left[c.k]--; else if (isWk(c.k)) ws++; }
  const inStack = new Set(ch.map((c) => c.id));
  const dest = S.topOf(G, br);
  for (const k in left) for (let i = 0; i < left[k]; i++) {
    const c = looseCard((q) => q === k, inStack);
    if (!c) return missHint(k, depth);
    return { from: c, to: dest };
  }
  if (ws < wn) { const c = looseCard(isWk, inStack); return c ? { from: c, to: dest } : null; }
  return null; // всё сложено — стопка работает
}
// запасные источники: деревья кончились — бревно найдётся в чаще и т.п.
const ALT_SRC = { wood: ["r_deadwood", "x_forest"], stone: ["r_quarry", "x_cave"], fiber: ["x_shore"], ore: ["r_quarry", "x_cave"], clay: ["x_shore"], meat: ["x_forest"], mushroom: ["x_forest"], berry: ["x_forest"] };
function missHint(k, depth) {
  if (RAW_SRC[k] && RAW_SRC[k] !== k) { const h = recipeHint(RAW_SRC[k], depth + 1); if (h) return h; }
  for (const id of ALT_SRC[k] || []) { const h = recipeHint(id, depth + 1); if (h) return h; }
  if (NAT_PACK[k]) return packHint(NAT_PACK[k]);
  const r = RAW_SRC[k]; if (r) return ideaPack(r);
  return null;
}
function tabHint(b) {
  const el = document.querySelector(`#tabs .chip[data-b="${b}"]`); if (!el) return null;
  const c = looseCard(isWk); return c ? { from: c, el } : null;
}
// рецепты, которые прямо двигают цель: если такая стопка уже работает — рука не мешает
const QUEST_RECS = { q_wood: ["r_wood"], q_stone: ["r_stone", "r_quarry"], q_berry: ["r_berry"], q_hut: ["r_hut"], q_fire: ["r_campfire"],
  q_cook: ["r_roast", "r_bakefish", "r_friedmush", "r_kroast", "r_bread", "r_pie", "r_soup", "r_stew"], q_field: ["r_field"], q_pop: ["r_breed"],
  q_arm: ["e_spear", "e_sword", "e_bow", "e_sword2"], q_store: ["r_shed", "r_warehouse"], q_island: ["r_boat"], q_mount: ["r_trail"], q_crystal: ["r_crystal"],
  q_dark: ["r_darkpath"], q_relic: ["x_ruins"], q_win: ["r_beacon"] };
function hintFor(q) {
  const qr = QUEST_RECS[q.id];
  if (qr) for (const id in G.cards) { const c = G.cards[id]; if (!c.dn && c.rc && qr.indexOf(c.rc) >= 0) return null; }
  const firstOf = (...ids) => { for (const id of ids) { const h = recipeHint(id); if (h) return h; } return null; };
  const packOnTable = rootsHere().find((r) => CARDS[r.k].c === "pack");
  if (packOnTable && q.id !== "q_sell") return { tapCard: packOnTable };
  switch (q.id) {
    case "q_wood": return recipeHint("r_wood");
    case "q_stone": return recipeHint("r_stone");
    case "q_berry": return recipeHint("r_berry");
    case "q_hut": return recipeHint("r_hut");
    case "q_sell": return sellHint();
    case "q_pack": { const p = PACKS.filter((x) => !S.packLocked(G, x)).sort((a, b) => a.cost - b.cost)[0]; return p ? packHint(p.k) : null; }
    case "q_night": return S.foodSafe(G) < S.foodNeed(G) ? firstOf("r_berry", "r_mush", "r_fish", "r_coconut", "r_honey", "x_forest") : null;
    case "q_fire": return recipeHint("r_campfire") || ideaPack("r_campfire");
    case "q_cook": return firstOf("r_roast", "r_bakefish", "r_friedmush") || (rootsHere().some((r) => r.k === "campfire") ? firstOf("r_mush", "x_forest") : recipeHint("r_campfire"));
    case "q_field": return recipeHint("r_field") || ideaPack("r_field") || packHint("pk_forest");
    case "q_kill": {
      const e = S.roots(G, board).find((c) => CARDS[c.k].c === "enemy" && !c.cb);
      if (e) { const w = looseCard(isWk); return w ? { from: w, to: e } : null; }
      return Object.keys(G.fights).length ? null : recipeHint("x_forest");
    }
    case "q_pop": return recipeHint("r_breed") || (rootsHere().some((r) => r.k === "hut" && r.br !== G.day) ? null : recipeHint("r_hut"));
    case "q_arm": return firstOf("e_sword", "e_spear", "e_bow", "r_spear", "r_bow") || packHint(G.day >= 3 ? "pk_defense" : "pk_stone");
    case "q_store": return firstOf("r_shed", "r_warehouse") || ideaPack("r_shed");
    case "q_island": return recipeHint("r_boat") || ideaPack("r_boat");
    case "q_mount": return firstOf("r_trail", "x_cave") || packHint("pk_explore");
    case "q_crystal": if (!G.open.mountains) return firstOf("r_trail", "x_cave"); return board !== "mountains" ? tabHint("mountains") : recipeHint("r_crystal");
    case "q_dark": return firstOf("r_darkpath", "e_lantern", "r_lantern") || ideaPack("r_lantern") || ideaPack("r_smithy");
    case "q_relic": if (!G.open.haunted) return null; return board !== "haunted" ? tabHint("haunted") : recipeHint("x_ruins");
    case "q_win": {
      const h = board === "home" ? recipeHint("r_beacon") : null; if (h) return h;
      if (board === "haunted") { const bw = rootsHere().find((r) => r.k === "barrow"); const w = looseCard((k) => ["warrior", "knight", "archer", "spearman"].indexOf(k) >= 0); if (bw && w && !G.f.bossOut) return { from: w, to: bw }; }
      return null;
    }
  }
  return null;
}
function hintActive() { return SET.hints !== 0 && G && !G.lost && !modal && !drag && G.ph === "day" && !paused; }
let hintQ = -1;
function updHint(dt) {
  if (G && G.q !== hintQ) { hintQ = G.q; idleT = 0; hintShown = 0; hintRest = 0; hint = null; }
  if (!hintActive()) { hint = null; return; }
  idleT += dt;
  if (hintRest > 0) { hintRest -= dt; hint = null; return; }
  const delay = G.q < 4 ? 1.2 : G.q < 8 ? 4 : 7;
  if (idleT < delay) { hint = null; return; }
  hintCalcT -= dt;
  if (hintCalcT <= 0) { hintCalcT = 0.5; const prev = hint; hint = G.q < QUESTS.length ? hintFor(QUESTS[G.q]) : null; if (!prev && hint) hintClock = 0; }
  if (!hint) return;
  hintClock += dt;
  if (hintClock > 2.4) { hintClock = 0; hintShown++; if (hintShown >= (G.q < 4 ? 6 : 3)) { hintShown = 0; hintRest = 16; hint = null; } }
}
function hintPts() {
  if (!hint) return null;
  const sp = (c) => { if (!G.cards[c.id] || c.b !== board) return null; const r = rsOf(c); return w2s(r.x, r.y + CH * 0.45); };
  const el = (e) => { const b = e.getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; };
  if (hint.tapCard) { const a = sp(hint.tapCard); return a && { a, b: a, tap: 1 }; }
  if (hint.tap) return { a: el(hint.el), b: el(hint.el), tap: 1, dom: 1 };
  if (!hint.from) return null;
  const a = sp(hint.from); if (!a) return null;
  const b = hint.to ? sp(hint.to) : el(hint.el); if (!b) return null;
  return { a, b, domB: !hint.to };
}
function drawHintWorld() {
  if (!hint) return;
  const glow = (c) => { if (!c || !G.cards[c.id]) return; const r = rsOf(c); ctx.save(); rr(ctx, r.x - CW / 2 - 6, r.y - 6, CW + 12, CH + 12, 14); ctx.lineWidth = 3; ctx.setLineDash([7, 5]); ctx.lineDashOffset = -clock * 20; ctx.strokeStyle = `rgba(255,226,140,${0.55 + 0.35 * Math.sin(clock * 5)})`; ctx.stroke(); ctx.restore(); };
  glow(hint.from); glow(hint.to); glow(hint.tapCard);
}
function drawHand(x, y, s, press) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.rotate(-0.35);
  ctx.fillStyle = "rgba(40,20,5,.25)"; ctx.beginPath(); ctx.ellipse(4, 30, 13, 5, 0, 0, 6.283); ctx.fill();
  ctx.translate(0, press * 3);
  ctx.lineWidth = 2.2; ctx.strokeStyle = INK; ctx.fillStyle = "#fff4e0"; ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(-4, 2); ctx.lineTo(-4, -14); ctx.quadraticCurveTo(-4, -19, 0, -19); ctx.quadraticCurveTo(4, -19, 4, -14); ctx.lineTo(4, 0);
  ctx.quadraticCurveTo(6, -4, 9, -2); ctx.quadraticCurveTo(12, -5, 15, -1); ctx.quadraticCurveTo(19, -3, 20, 2);
  ctx.lineTo(20, 12); ctx.quadraticCurveTo(20, 24, 8, 26); ctx.lineTo(0, 26); ctx.quadraticCurveTo(-8, 25, -11, 16); ctx.lineTo(-14, 8);
  ctx.quadraticCurveTo(-15, 3, -10, 3); ctx.lineTo(-4, 9); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(9, -2); ctx.lineTo(9, 6); ctx.moveTo(15, -1); ctx.lineTo(15, 6); ctx.stroke();
  ctx.restore();
}
function drawHintHand() {
  const P = hintPts(); if (!P) return;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  const k = hintClock / 2.4;
  let x, y, press = 0, al = 1;
  if (P.tap) { x = P.a[0]; y = P.a[1]; press = Math.max(0, Math.sin(k * Math.PI * 4)); al = Math.min(1, k * 6, (1 - k) * 6); }
  else {
    const e = k < 0.18 ? 0 : k > 0.82 ? 1 : (k - 0.18) / 0.64, ee = e * e * (3 - 2 * e);
    x = P.a[0] + (P.b[0] - P.a[0]) * ee; y = P.a[1] + (P.b[1] - P.a[1]) * ee - Math.sin(ee * Math.PI) * 26;
    press = k < 0.18 ? k / 0.18 : k > 0.82 ? 1 - (k - 0.82) / 0.18 : 1; al = Math.min(1, k * 8, (1 - k) * 8);
    // призрак перетаскиваемой карты
    if (hint.from && e > 0 && e < 1) { ctx.globalAlpha = 0.45 * al; const s2 = sprite(hint.from.k, bucket()); const z = cam.z; ctx.drawImage(s2, x - (CW / 2 + PAD) * z, y - (CH * 0.45 + PAD) * z, (CW + PAD * 2) * z, (CH + PAD * 2) * z); }
  }
  // стрелка у края, если цель за экраном
  const off = (p) => p[0] < 10 || p[0] > W - 10 || p[1] < 60 || p[1] > Hh - 60;
  for (const p of P.domB ? [P.a] : [P.a, P.b]) if (!P.dom && off(p)) {
    const cx = Math.max(28, Math.min(W - 28, p[0])), cy = Math.max(90, Math.min(Hh - 130, p[1])), a = Math.atan2(p[1] - cy, p[0] - cx);
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(a); ctx.globalAlpha = 0.9; ctx.fillStyle = "#fff4e0"; ctx.strokeStyle = INK; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-8, -11); ctx.lineTo(-4, 0); ctx.lineTo(-8, 11); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
  }
  ctx.globalAlpha = 0.95 * al;
  drawHand(x + 6, y + 14, 1.15, press);
  ctx.globalAlpha = 1;
}

/* ---------- ввод ---------- */
const ptrs = new Map();
let down = null, pinch = null, pan = null, lpT = 0;
function hitCard(wx, wy) {
  const inR = (c) => { const r = rsOf(c); return wx > r.x - CW / 2 && wx < r.x + CW / 2 && wy > r.y && wy < r.y + CH; };
  const list = [];
  for (const id in G.cards) { const c = G.cards[id]; if (c.b === board && !c.dn && !(drag && drag.root === c)) list.push(c); }
  const enem = list.filter((c) => CARDS[c.k].c === "enemy" && !c.cb), fig = list.filter((c) => c.cb), rest = list.filter((c) => !c.cb && CARDS[c.k].c !== "enemy").sort((a, b) => zOf(b) - zOf(a));
  for (const c of enem) if (inR(c)) return c;
  for (const c of fig) if (inR(c)) return c;
  for (const r of rest) { const ch = S.chain(G, r); for (let i = ch.length - 1; i >= 0; i--) if (inR(ch[i])) return ch[i]; }
  return null;
}
function findTarget(r) {
  const h = S.stackH(G, r);
  const ax0 = r.x - CW / 2, ax1 = r.x + CW / 2, ay0 = r.y, ay1 = r.y + Math.min(h, CH);
  let best = null, bs = CW * CH * 0.18;
  const chainIds = new Set(S.chain(G, r).map((c) => c.id));
  for (const id in G.cards) {
    const c = G.cards[id];
    if (c.b !== board || chainIds.has(c.id)) continue;
    if (c.dn && !c.cb) continue;
    const isE = CARDS[c.k].c === "enemy";
    let bx0, bx1, by0, by1;
    if (c.cb && !isE) continue;
    const ch = c.cb ? CH : (c.h || S.stackH(G, c));
    bx0 = c.x - CW / 2; bx1 = c.x + CW / 2; by0 = c.y; by1 = c.y + ch;
    const ox = Math.min(ax1, bx1) - Math.max(ax0, bx0), oy = Math.min(ay1, by1) - Math.max(ay0, by0);
    if (ox <= 0 || oy <= 0) continue;
    const s = ox * oy * (isE ? 1.4 : 1);
    if (s > bs) { bs = s; best = c; }
  }
  if (!best) return null;
  const bad = targetBad(r, best);
  return { c: best, bad };
}
function targetBad(r, t) {
  const td = CARDS[t.k], cs = S.chain(G, r);
  const hasW = cs.some((c) => (CARDS[c.k].tg || []).indexOf("w") >= 0);
  if (td.c === "enemy") return !hasW;
  if (td.c === "pack") return true;
  if (t.k === "barrow") return !hasW;
  const tr = S.root(G, t);
  if ((r.k === "coin") !== (tr.k === "coin")) return true;
  return false;
}
function domHit(x, y) {
  const el = document.elementFromPoint(x, y);
  if (!el) return null;
  if (el.closest("#sell")) return { sell: 1 };
  const p = el.closest(".pack"); if (p) return { pack: p.dataset.k, el: p };
  const tb = el.closest("#tabs .chip"); if (tb) return { tab: tb.dataset.b, el: tb };
  if (el.closest("#tray") || el.closest("#top")) return { hud: 1 };
  return null;
}
let domHot = null;
function setDomHot(h) {
  if (domHot && domHot.el) domHot.el.classList.remove("drop");
  $("sell").classList.remove("hot", "bad");
  domHot = h;
  if (!h) return;
  if (h.sell) $("sell").classList.add(drag && (drag.root.k === "coin" || !S.canSell(G, drag.root)) ? "bad" : "hot");
  else if (h.el && (h.tab || (h.pack && drag && drag.root.k === "coin"))) h.el.classList.add("drop");
}
cv.addEventListener("pointerdown", (e) => {
  if (!G || modal) return;
  userActed();
  cv.setPointerCapture(e.pointerId);
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (ptrs.size === 2) {
    clearTimeout(lpT); down = null;
    if (drag) return;
    const [a, b] = [...ptrs.values()];
    pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: cam.z, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, cx: cam.x, cy: cam.y };
    pan = null; return;
  }
  const [wx, wy] = s2w(e.clientX, e.clientY);
  const c = hitCard(wx, wy);
  down = { x: e.clientX, y: e.clientY, t: performance.now(), c, id: e.pointerId, moved: false, lp: false };
  if (c) lpT = setTimeout(() => { if (down && !down.moved) { down.lp = true; showInfo(down.c); haptic("select"); } }, 430);
  else pan = { x: e.clientX, y: e.clientY, cx: cam.x, cy: cam.y, vx: 0, vy: 0 };
});
cv.addEventListener("pointermove", (e) => {
  if (!ptrs.has(e.pointerId)) return;
  const prev = ptrs.get(e.pointerId);
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinch && ptrs.size >= 2) {
    const [a, b] = [...ptrs.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const z = Math.max(minZoom(), Math.min(2.4, pinch.z * d / pinch.d));
    const wx = (pinch.mx - W / 2) / pinch.z + pinch.cx, wy = (pinch.my - Hh / 2) / pinch.z + pinch.cy;
    cam.z = z; cam.x = wx - (mx - W / 2) / z; cam.y = wy - (my - Hh / 2) / z; clampCam();
    return;
  }
  if (down && !down.moved && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 7) {
    down.moved = true; clearTimeout(lpT);
    if (down.c && !down.lp && CARDS[down.c.k].c !== "enemy") startDrag(down.c, e);
    else if (!pan) pan = { x: e.clientX, y: e.clientY, cx: cam.x, cy: cam.y, vx: 0, vy: 0 };
  }
  if (drag && e.pointerId === drag.pid) {
    drag.sx = e.clientX; drag.sy = e.clientY;
    drag.vx = drag.vx * 0.7 + (e.clientX - prev.x) * 0.3 * 60;
    moveDrag();
  } else if (pan) {
    cam.x = pan.cx - (e.clientX - pan.x) / cam.z; cam.y = pan.cy - (e.clientY - pan.y) / cam.z;
    pan.vx = (e.clientX - prev.x); pan.vy = (e.clientY - prev.y);
    clampCam();
  }
});
function endPtr(e) {
  if (!ptrs.has(e.pointerId)) return;
  ptrs.delete(e.pointerId);
  if (pinch) { if (ptrs.size < 2) pinch = null; down = null; return; }
  clearTimeout(lpT);
  if (drag && e.pointerId === drag.pid) { endDrag(e); return; }
  if (down && !down.moved && !down.lp) tap(down.c);
  if (pan) { inertia = { vx: pan.vx * 60, vy: pan.vy * 60 }; }
  down = null; pan = null;
}
let inertia = null, camGoal = null;
cv.addEventListener("pointerup", endPtr);
cv.addEventListener("pointercancel", endPtr);
cv.addEventListener("wheel", (e) => {
  e.preventDefault(); if (!G || modal) return;
  const [wx, wy] = s2w(e.clientX, e.clientY);
  cam.z = Math.max(minZoom(), Math.min(2.4, cam.z * Math.exp(-e.deltaY * 0.0015)));
  cam.x = wx - (e.clientX - W / 2) / cam.z; cam.y = wy - (e.clientY - Hh / 2) / cam.z; clampCam();
}, { passive: false });
function startDrag(c, e) {
  const r = S.pick(G, c);
  if (!r) return;
  const [wx, wy] = s2w(e.clientX, e.clientY);
  drag = { root: r, ox: wx - r.x, oy: wy - r.y, pid: down.id, sx: e.clientX, sy: e.clientY, vx: 0, snap: null };
  bumpZ(r); hideInfo(); selected = 0;
  play("whoosh", { vol: 0.35, rate: 1.3 }); haptic("impact", "light");
}
let lastTgt = null;
function moveDrag() {
  const r = drag.root;
  const [wx, wy] = s2w(drag.sx, drag.sy);
  r.x = wx - drag.ox; r.y = wy - drag.oy;
  S.layout(G, r);
  const dh = domHit(drag.sx, drag.sy);
  setDomHot(dh && !dh.hud ? dh : null);
  target = dh ? null : findTarget(r);
  drag.snap = null;
  if (target && !target.bad) {
    const tr = target.c.cb ? null : S.root(G, target.c);
    if (tr) { const top = S.topOf(G, tr); const sx = top.x - r.x, sy = top.y + 24 - r.y; drag.snap = [sx * 0.3, sy * 0.3]; }
  }
  const tk = target ? target.c.id : 0;
  if (tk !== lastTgt) { lastTgt = tk; if (tk) haptic("select"); }
}
// стопка, брошенная на пустое место, не прячется под верхней панелью и магазином
function clampToView(r, px, py) {
  const v = S.VIEW[board]; if (!v) return [px, py];
  const h = Math.min(S.stackH(G, r), CH * 1.6);
  if (v[2] - v[0] > CW + 10) px = Math.max(v[0] + CW / 2, Math.min(v[2] - CW / 2, px));
  if (v[3] - v[1] > h + 10) py = Math.max(v[1], Math.min(v[3] - h, py));
  return [px, py];
}
function measureHud() { const t = $("top").getBoundingClientRect(), tr = $("tray").getBoundingClientRect(); hudTop = t.bottom; trayTop = tr.top; }
function setViewRect() {
  if (!G) return;
  const [x0, y0] = s2w(8, hudTop + 26), [x1, y1] = s2w(W - 8, trayTop - 6);
  S.setView(board, x0, y0, x1, y1);
}
function endDrag(e) {
  const r = drag.root;
  const dh = domHit(e.clientX, e.clientY);
  setDomHot(null);
  const [wx, wy] = s2w(e.clientX, e.clientY);
  let px = wx - drag.ox, py = wy - drag.oy;
  const tg = target && !(dh && !dh.hud) ? target.c : null;
  if (!tg) [px, py] = clampToView(r, px, py);
  drag = null; target = null; lastTgt = null; down = null;
  if (!G.cards[r.id]) return;
  if (dh && dh.sell) {
    const back = () => { const q = clampToView(r, r.x, r.y); S.drop(G, r, q[0], q[1], null); };
    if (r.k === "coin") { back(); toast("Монеты не продаются — на них покупают наборы", ""); play("error"); return; }
    if (!S.canSell(G, r)) { back(); toast(S.chain(G, r).some((c) => S.isPerson(c.k)) ? "Жителей не продают" : "Это нельзя продать", "bad"); play("error"); haptic("notify", "error"); return; }
    r.drag = 0;
    const [cx, cy] = viewCenterBottom();
    S.sell(G, r, cx, cy);
    return;
  }
  if (dh && dh.pack) { S.drop(G, r, px, py, null); if (r.k === "coin") buy(dh.pack); return; }
  if (dh && dh.tab) {
    S.drop(G, r, px, py, null);
    if (dh.tab === board) return;
    if (S.travel(G, r, dh.tab)) { toast("🧭 Отправлено: " + L(BIOMES[dh.tab].n), ""); flash(dh.el); }
    else { toast("Туда это не отправить", "bad"); play("error"); }
    return;
  }
  if (dh && dh.hud) { S.drop(G, r, px, py, null); return; }
  const res = S.drop(G, r, px, py, tg);
  if (res === "fight" || res === "stack") bumpZ(S.root(G, r));
}
function tap(c) {
  if (!c) { hideInfo(); selected = 0; return; }
  if (CARDS[c.k].c === "pack") { S.openPack(G, c); hideInfo(); return; }
  if (selected === c.id && !$("info").classList.contains("hidden")) { hideInfo(); selected = 0; return; }
  showInfo(c);
}

/* ---------- HUD ---------- */
function buildPacks() {
  const box = $("packs"); box.innerHTML = "";
  for (const p of PACKS) {
    const el = document.createElement("div"); el.className = "pack"; el.dataset.k = p.k;
    el.style.setProperty("--pc", (PACK_ICON[p.k] || [0, "#c27598"])[1]);
    const c = document.createElement("canvas"); c.width = c.height = 80; drawIcon(c.getContext("2d"), p.k, 0, 0, 80);
    const b = document.createElement("b"); b.textContent = L(p.n);
    const pr = document.createElement("span"); pr.className = "price"; pr.textContent = p.cost + " 🪙";
    el.append(c, b, pr);
    el.addEventListener("click", () => buy(p.k));
    box.appendChild(el);
  }
}
function buy(k) {
  if (!G) return;
  const p = PACKS.find((q) => q.k === k);
  if (S.packLocked(G, p)) { toast("🔒 " + L(PACK_LOCK[p.lock]), ""); play("error"); return; }
  const have = S.coins(G);
  if (have < p.cost) { toast("Нужно ещё " + (p.cost - have) + " 🪙 — продай лишние карты", "bad"); play("error"); haptic("notify", "error"); const el = document.querySelector(`.pack[data-k="${k}"]`); flash(el); return; }
  const [x, y] = viewCenterBottom();
  const c = S.buyPack(G, k, board, x, y - 40);
  if (c) { St.event("pack", { k, day: G.day }); const el = document.querySelector(`.pack[data-k="${k}"]`); flash(el); }
}
function buildTabs() {
  const box = $("tabs"); box.innerHTML = "";
  const open = Object.keys(BIOMES).filter((b) => G && G.open[b]);
  if (open.length < 2) return;
  for (const b of open) {
    const el = document.createElement("div"); el.className = "chip" + (b === board ? " on" : ""); el.dataset.b = b;
    el.innerHTML = `<span class="dot"></span>${L(BIOMES[b].n)}`;
    el.addEventListener("click", () => switchBoard(b));
    box.appendChild(el);
  }
}
function switchBoard(b) {
  if (b === board || !G || !G.open[b]) return;
  cams[board] = { x: cam.x, y: cam.y, z: cam.z };
  board = b;
  cam = cams[b] || { x: BIOMES[b].w / 2, y: BIOMES[b].h / 2 - (W < 700 ? 120 : 80), z: defZoom() };
  clampCam(); RS.clear(); parts.length = 0; hideInfo(); selected = 0;
  document.body.style.background = OUT[b];
  buildTabs(); play("whoosh", { vol: 0.5 });
}
function flash(el) { if (typeof el === "string") el = $(el); if (!el) return; el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash"); }
function toast(txt, cls, life) {
  const box = $("toasts");
  try { measureHud(); box.style.top = Math.round(hudTop + 6) + "px"; } catch (_) {}
  while (box.children.length > 3) box.firstChild.remove();
  const el = document.createElement("div"); el.className = "toast " + (cls || ""); el.textContent = L(txt);
  el.style.setProperty("--life", (life || 2.6) + "s");
  box.appendChild(el);
  setTimeout(() => el.remove(), ((life || 2.6) + 0.5) * 1000);
}
let bannerT = 0;
function banner(a, b) { const el = $("banner"); el.innerHTML = ""; el.append(document.createTextNode(L(a))); if (b) { const s = document.createElement("small"); s.textContent = L(b); el.appendChild(s); } el.classList.add("show"); clearTimeout(bannerT); bannerT = setTimeout(() => el.classList.remove("show"), 2200); }
function showHold() {
  const over = S.cardCount(G) - S.capacity(G);
  const el = $("hold");
  if (over <= 0) { el.classList.add("hidden"); return; }
  el.textContent = L("🃏 Мест не хватает: лишних карт — " + over + ". Продай их, и наступит утро.");
  el.classList.remove("hidden");
}
function setText(el, s) { if (el.textContent !== s) el.textContent = s; }
function updHud() {
  if (!G) return;
  const p = G.t / DAY_LEN;
  setText($("dayn"), L("День") + " " + G.day);
  $("daybar").firstElementChild.style.width = (G.ph === "day" ? p * 100 : 100) + "%";
  $("dayarc").setAttribute("stroke-dashoffset", String(62.8 * (1 - (G.ph === "day" ? p : 1))));
  setText($("dayico"), G.ph !== "day" ? "🌙" : p > 0.75 ? "🌇" : "☀️");
  const pop = S.popCount(G), need = pop * EAT, safe = S.foodSafe(G);
  setText($("s-pop").lastElementChild, String(pop));
  setText($("s-food").lastElementChild, safe + "/" + need);
  $("s-food").classList.toggle("warn", safe < need && (p > 0.45 || G.ph !== "day"));
  $("s-food").classList.toggle("ok", safe >= need);
  const cc = S.cardCount(G), cap = S.capacity(G);
  setText($("s-cards").lastElementChild, cc + "/" + cap);
  $("s-cards").classList.toggle("warn", cc > cap);
  setText($("s-coin").lastElementChild, String(S.coins(G)));
  if (G.ph === "day" && p > 0.66 && safe < need && warnedFood !== G.day) { warnedFood = G.day; toast("🍖 Еды на ночь не хватит: нужно " + need + ", есть " + safe, "bad", 3.5); haptic("notify", "warning"); }
  const q = S.questNow(G);
  setText($("qn"), L(q.n)); setText($("qh"), L(q.h));
  const coins = S.coins(G);
  document.querySelectorAll(".pack").forEach((el) => { const pk = PACKS.find((x) => x.k === el.dataset.k); el.classList.toggle("locked", S.packLocked(G, pk)); el.classList.toggle("cant", coins < pk.cost); });
  setText($("bookn"), String(Object.keys(G.kn).length));
  document.querySelectorAll(".pack.hinted").forEach((el) => { if (!hint || hint.el !== el) el.classList.remove("hinted"); });
  if (hint && hint.tap && hint.el) hint.el.classList.add("hinted");
  $("toasts").style.top = Math.round(hudTop + 6) + "px";
  // вкладки: тревога, если на крае враги
  document.querySelectorAll("#tabs .chip").forEach((el) => { const b = el.dataset.b; el.classList.toggle("alert", Object.values(G.cards).some((c) => c.b === b && CARDS[c.k].c === "enemy")); });
  if (G.ph === "hold") showHold();
  document.querySelectorAll("#speed button").forEach((b) => b.classList.toggle("on", +b.dataset.s === (paused ? 0 : speed)));
}
$("speed").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  const s = +b.dataset.s;
  if (s === 0) paused = !paused; else { paused = false; speed = s; }
  play("click", { vol: 0.5 }); haptic("select"); updHud();
});
$("quest").addEventListener("click", () => openGoals());
function setHints(on) { SET.hints = on ? 1 : 0; saveSet(); $("hintb").classList.toggle("off", !on); userActed(); }
$("hintb").addEventListener("click", () => { setHints(!SET.hints); toast(SET.hints ? "💡 Подсказки включены" : "Подсказки выключены — включить можно здесь же", ""); play("click", { vol: 0.5 }); });
$("hintb").classList.toggle("off", SET.hints === 0);
$("bookb").addEventListener("click", () => openBook());
$("menub").addEventListener("click", () => openPause());

/* ---------- подсказка по карте ---------- */
function tokenName(tk) {
  if (tk === "@w") return L("Житель");
  if (tk === "?@w") return L("житель (быстрее)");
  const k = tk.replace(/^[=~]/, "");
  return nm(k);
}
function tokenKey(tk) { if (tk === "@w" || tk === "?@w") return "villager"; return tk.replace(/^[=~]/, ""); }
function showInfo(c) {
  selected = c.id;
  const d = CARDS[c.k], cat = CATS[d.c];
  const el = $("info"); el.innerHTML = "";
  const cvs = document.createElement("canvas"); cvs.width = 112; cvs.height = 152;
  const x = cvs.getContext("2d"); x.scale(112 / CW, 152 / CH); drawCardFace(x, c.k);
  const tx = document.createElement("div"); tx.className = "tx";
  const lines = [];
  if (d.hp) lines.push("❤ " + Math.max(0, c.hp) + "/" + (c.mhp || d.hp) + "  ⚔ " + d.atk + (d.def ? "  🛡 " + d.def : ""));
  if (d.c === "food") lines.push(L("Сытость") + ": " + (c.f != null ? c.f : d.f));
  if (c.u != null && d.u) lines.push(L("Осталось") + ": " + c.u);
  if (d.cap) lines.push("🃏 +" + d.cap);
  const sv = S.sellValue(G, c); if (sv != null && sv > 0) lines.push(L("Цена") + ": " + sv + " 🪙");
  if (d.c === "person") lines.push(L("Ест") + ": " + EAT + " 🍖");
  const known = RECIPES.filter((r) => G.kn[r.id] && r.need.some((tk) => tokenKey(tk) === c.k || (d.c === "person" && tk === "@w" && false)));
  const unk = RECIPES.filter((r) => !G.kn[r.id] && r.need.some((tk) => tokenKey(tk) === c.k)).length;
  const rc = known.slice(0, 3).map((r) => r.need.filter((t) => t !== "?@w").map(tokenName).join(" + ") + " → " + recName(r.id));
  tx.innerHTML = `<div class="cat" style="color:${cat.d}"></div><b></b><div class="d"></div><div class="st"></div><div class="rc"></div>`;
  tx.querySelector(".cat").textContent = L(cat.n); tx.querySelector("b").textContent = L(d.n); tx.querySelector(".d").textContent = L(d.d);
  tx.querySelector(".st").textContent = lines.join(" · ");
  const rcEl = tx.querySelector(".rc");
  rc.forEach((s) => { const dv = document.createElement("div"); dv.textContent = "📖 " + s; rcEl.appendChild(dv); });
  if (unk) { const dv = document.createElement("div"); dv.textContent = "❔ " + L("Ещё не открыто рецептов") + ": " + unk; rcEl.appendChild(dv); }
  const xb = document.createElement("button"); xb.className = "x"; xb.textContent = "✕"; xb.onclick = () => { hideInfo(); selected = 0; };
  el.append(cvs, tx, xb);
  el.classList.remove("hidden");
  play("select", { vol: 0.4 });
}
function hideInfo() { $("info").classList.add("hidden"); }

/* ---------- экраны ---------- */
function show(id) { document.querySelectorAll(".screen").forEach((s) => s.classList.add("hidden")); if (id) { $(id).classList.remove("hidden"); modal = id; } else modal = ""; }
document.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => { play("click"); show(G && !G.lost ? "" : "screen-menu"); if (backTo) { const b2 = backTo; backTo = ""; show(b2); } }));
let backTo = "";
function openPause() {
  if (!G) return;
  setText($("p-sub"), L("День") + " " + G.day + " · " + L("жителей") + ": " + S.popCount(G) + " · " + L("рецептов") + ": " + Object.keys(G.kn).length);
  setText($("p-snd"), SET.snd ? L("🔊 Звук: вкл") : L("🔇 Звук: выкл"));
  setText($("p-hints"), SET.hints !== 0 ? L("💡 Подсказки: вкл") : L("💡 Подсказки: выкл"));
  show("screen-pause"); play("click");
}
$("p-resume").onclick = () => { show(""); play("click"); };
$("p-goals").onclick = () => { openGoals(); backTo = "screen-pause"; };
$("p-help").onclick = () => { show("screen-help"); backTo = "screen-pause"; };
$("p-snd").onclick = () => { SET.snd = SET.snd ? 0 : 1; saveSet(); openPause(); if (SET.snd) music(G && G.f.bossOut && !G.f.boss ? "m_battle2" : "m_build"); };
$("p-hints").onclick = () => { setHints(SET.hints === 0); openPause(); };
$("p-menu").onclick = () => { save(true); openMenu(); };
function openMenu() {
  const d = G && !G.lost ? G.day : SV.hasLocal();
  $("m-cont").classList.toggle("hidden", !d || (G && G.lost));
  setText($("m-cont-s"), d ? L("День") + " " + d : "");
  show("screen-menu");
}
$("m-cont").onclick = () => { play("confirm"); if (!G) return; show(""); music(G.f.bossOut && !G.f.boss ? "m_battle2" : "m_build"); };
$("m-new").onclick = () => { if (G && !G.lost && G.day > 1) { show("screen-new"); backTo = ""; } else newColony(); };
$("n-yes").onclick = () => newColony();
$("m-help").onclick = () => { show("screen-help"); backTo = "screen-menu"; };
$("m-games").onclick = () => { location.href = "../"; };
function openBook() {
  if (!G) return;
  const list = $("bk-list"); list.innerHTML = "";
  const groups = [["Сбор", ["gather", "food", "nat"]], ["Ремесло", ["craft"]], ["Постройки", ["build", "breed"]], ["Еда и грядки", ["cook", "farm"]], ["Роли", ["equip"]], ["Разведка", ["explore"]]];
  let known = 0;
  for (const [title, cats] of groups) {
    const rs = RECIPES.filter((r) => cats.indexOf(r.cat) >= 0);
    const kn = rs.filter((r) => G.kn[r.id]);
    known += kn.length;
    const h = document.createElement("div"); h.className = "bk-h"; h.textContent = L(title) + " · " + kn.length + "/" + rs.length; list.appendChild(h);
    for (const r of kn) {
      const row = document.createElement("div"); row.className = "rec";
      const n = document.createElement("div"); n.className = "nm"; n.textContent = recName(r.id) + (r.cat === "nat" ? "" : " · " + r.t + L(" с")); row.appendChild(n);
      r.need.forEach((tk, i) => {
        if (i) row.appendChild(Object.assign(document.createElement("span"), { textContent: "+" }));
        const s = document.createElement("span"); s.className = "ing";
        const im = document.createElement("img"); im.src = iconURL(tokenKey(tk), 22); im.width = 22; im.height = 22; im.alt = "";
        s.append(im, document.createTextNode(tokenName(tk) + (tk[0] === "=" ? " ↺" : tk[0] === "~" ? " ↺" : "")));
        row.appendChild(s);
      });
      row.appendChild(Object.assign(document.createElement("span"), { className: "ar", textContent: "→" }));
      const outs = r.out || (Array.isArray(r.lo) ? r.lo.map((x) => x[0]) : null);
      if (outs) { const cnt = {}; outs.forEach((k) => (cnt[k] = (cnt[k] || 0) + 1)); for (const k in cnt) { const s = document.createElement("span"); s.className = "ing"; const im = document.createElement("img"); im.src = iconURL(k, 22); im.width = 22; im.height = 22; im.alt = ""; s.append(im, document.createTextNode(nm(k) + (cnt[k] > 1 ? " ×" + cnt[k] : ""))); row.appendChild(s); } }
      else row.appendChild(Object.assign(document.createElement("span"), { className: "ing", textContent: L("находки или бой") }));
      list.appendChild(row);
    }
    const left = rs.length - kn.length;
    if (left) { const u = document.createElement("div"); u.className = "rec unk"; u.textContent = "❔ " + L("Не открыто") + ": " + left; list.appendChild(u); }
  }
  setText($("bk-sub"), L("Открыто рецептов") + ": " + known + " / " + RECIPES.length + ". " + L("↺ — карта остаётся. Пробуй новые стопки!"));
  show("screen-book"); play("open", { vol: 0.6 });
}
function openGoals() {
  if (!G) return;
  const list = $("gl-list"); list.innerHTML = "";
  QUESTS.forEach((q, i) => {
    const done = i < G.q, cur = i === G.q;
    const el = document.createElement("div"); el.className = "goal" + (done ? " done" : cur ? " cur" : i > G.q + 2 ? " lock" : "");
    el.innerHTML = `<span class="gi">${done ? "✅" : cur ? "🎯" : "▫️"}</span><span><b></b><small></small></span>`;
    el.querySelector("b").textContent = L(q.n); el.querySelector("small").textContent = i > G.q + 2 ? "…" : L(q.h);
    list.appendChild(el);
  });
  if (G.q >= QUESTS.length) { const q = S.questNow(G); const el = document.createElement("div"); el.className = "goal cur"; el.innerHTML = `<span class="gi">♾</span><span><b></b><small></small></span>`; el.querySelector("b").textContent = L(q.n); el.querySelector("small").textContent = L(q.h); list.appendChild(el); }
  show("screen-goals"); play("open", { vol: 0.6 });
}
function showEnd(win) {
  if (!G) return;
  save(true);
  $("end-emoji").textContent = win ? (G.won === "boss" ? "👑" : "🔥") : "🪦";
  setText($("end-title"), L(win ? (G.won === "boss" ? "Князь повержен!" : "Маяк зажжён!") : "Колония пала"));
  setText($("end-sub2"), L(win ? "Край свободен. Можно жить дальше — набеги станут сильнее." : "Последний житель погиб. Попробуй ещё раз: копи еду заранее и вооружай жителей."));
  const sub = $("end-sub"); sub.innerHTML = "";
  const st = [["Дней", G.day], ["Жителей сейчас", S.popCount(G)], ["Больше всего жителей", G.st.maxPop], ["Рецептов открыто", Object.keys(G.kn).length + " / " + RECIPES.length], ["Побеждено врагов", G.st.kills], ["Погибло", G.st.deaths], ["Наборов куплено", G.st.packs]];
  for (const [a, b] of st) { const r = document.createElement("div"); r.className = "stat"; r.innerHTML = "<span></span><b></b>"; r.firstChild.textContent = L(a); r.lastChild.textContent = String(b); sub.appendChild(r); }
  const bb = $("end-buttons"); bb.innerHTML = "";
  const mk = (txt, cls, fn) => { const b = document.createElement("button"); b.className = "btn " + (cls || ""); b.textContent = L(txt); b.onclick = fn; bb.appendChild(b); };
  if (win) mk("♾ Играть дальше", "primary", () => { show(""); music("m_build"); });
  mk("🌱 Новая колония", win ? "" : "primary", () => newColony());
  // «Позвать друга», «Идея / баг» и канал добавляет shared/feedback.js
  mk("В меню", "ghost", () => openMenu());
  show("screen-end");
}

/* ---------- запуск ---------- */
function newColony() {
  SV.wipe();
  G = S.newGame((Date.now() ^ (Math.random() * 1e9)) >>> 0);
  board = "home"; RS.clear(); Z.clear(); parts.length = 0;
  for (const k in cams) delete cams[k];
  // стартовые карты — по центру видимой части стола (между верхней панелью и магазином)
  measureHud(); { const z = defZoom(); cam = { x: BIOMES.home.w / 2, y: BIOMES.home.h / 2 - 22 - ((hudTop + trayTop) / 2 - Hh / 2) / z, z }; } clampCam();
  buildTabs(); show(""); paused = false; speed = 1;
  St.gameStart({ mode: "new" });
  music("m_build"); play("confirm");
  save(true);
}
function save(force) { if (G) SV.save(G, force); }
document.addEventListener("visibilitychange", () => { if (document.hidden) save(true); });
addEventListener("pagehide", () => save(true));

function loop(now) {
  const dt = Math.min(0.05, (now - (lastT || now)) / 1000); lastT = now;
  if (G && !modal && !paused && !G.lost && !document.hidden) {
    let sd = dt * speed;
    while (sd > 1e-6) { const d = Math.min(0.1, sd); S.step(G, d); sd -= d; }
    if (drag) { // перетаскиваемая стопка остаётся под пальцем
      const r = drag.root; if (G.cards[r.id]) { const [wx, wy] = s2w(drag.sx, drag.sy); r.x = wx - drag.ox; r.y = wy - drag.oy; S.layout(G, r); }
      // автопрокрутка у краёв
      const m = 34, sp = 520 * dt / cam.z;
      if (drag.sx < m) cam.x -= sp; else if (drag.sx > W - m) cam.x += sp;
      if (drag.sy < m + 20) cam.y -= sp;
      clampCam();
    }
    saveT += dt; if (saveT > 8) { saveT = 0; save(); }
  }
  if (camGoal) { const k = 1 - Math.exp(-dt * 4); cam.x += (camGoal.x - cam.x) * k; cam.y += (camGoal.y - cam.y) * k; camGoal.t -= dt; if (camGoal.t <= 0 || pan || drag) camGoal = null; clampCam(); }
  if (inertia && !pan && !drag) { cam.x -= inertia.vx * dt / cam.z; cam.y -= inertia.vy * dt / cam.z; inertia.vx *= 0.9; inertia.vy *= 0.9; if (Math.abs(inertia.vx) + Math.abs(inertia.vy) < 5) inertia = null; clampCam(); }
  try { if (G) onEvents(); } catch (e) { console.error("events", e); }
  setViewRect();
  try { updHint(dt); } catch (e) { console.error("hint", e); hint = null; }
  const r0 = performance.now();
  try { render(dt); } catch (e) { console.error("render", e && e.stack || e); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; } rt = rt * 0.95 + (performance.now() - r0) * 0.05;
  hudT += dt; if (hudT > 0.2) { hudT = 0; updHud(); measureHud(); }
  requestAnimationFrame(loop);
}

// шрифты свои (fonts/): когда загрузятся — перерисовать спрайты карт с ними
try {
  Promise.race([Promise.all([document.fonts.load('800 12px Nunito'), document.fonts.load('900 12px Nunito'), document.fonts.load('700 12px Comfortaa')]), new Promise((r) => setTimeout(r, 2500))])
    .then(() => { SPR.clear(); buildPacks(); });
} catch (_) {}
document.querySelectorAll("img.ico[data-ic]").forEach((im) => { im.src = iconURL(im.dataset.ic, 22); });
// логотип в меню
(function logo() { const c = $("logo"); const x = c.getContext("2d"); drawIcon(x, "campfire", 0, 0, 112); })();
T.init && T.init({ header: "#5b3b25", bg: "#5b3b25", back: "../" });
buildPacks();
SV.load().then((g) => {
  $("loading").remove();
  if (g) {
    G = g; board = "home"; measureHud(); { const z = defZoom(); cam = { x: BIOMES.home.w / 2, y: BIOMES.home.h / 2 - 22 - ((hudTop + trayTop) / 2 - Hh / 2) / z, z }; } clampCam(); buildTabs();
    if (G.lost) { G = null; }
  }
  openMenu();
  requestAnimationFrame(loop);
});

// для автотестов
window.KOL = {
  get G() { return G; }, S, CARDS, get board() { return board; }, get cam() { return cam; }, w2s, s2w, switchBoard, newColony,
  look(x, y) { cam.x = x; cam.y = y; clampCam(); },
  setSpeed(s) { speed = s; paused = false; }, pause(p) { paused = p; }, get modal() { return modal; }, show, buy,
  screenOf(id) { const c = G.cards[id]; if (!c) return null; const r = rsOf(c); return w2s(r.x, r.y + CH / 2); },
  get fps() { return fps; }, get rt() { return rt; },
  hintNow() { if (!G || G.q >= QUESTS.length) return null; const h = hintFor(QUESTS[G.q]); if (!h) return null;
    return { from: h.from && h.from.id, to: h.to && h.to.id, el: h.el ? (h.el.id ? "#" + h.el.id : h.el.dataset.k ? `.pack[data-k="${h.el.dataset.k}"]` : `#tabs .chip[data-b="${h.el.dataset.b}"]`) : null, tap: !!h.tap, tapCard: h.tapCard && h.tapCard.id }; },
  get hintShownNow() { return !!hint; },
  face(k, sc) { return sprite(k, sc || 2); },
};
