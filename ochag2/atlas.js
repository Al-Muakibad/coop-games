// «Хутор» — лица карт в одной текстуре-атласе (2048×2048, ячейка 128×174) и мелкие значки (цифры, сердца, полоски).
import * as THREE from "three";
import { CARDS, CATS, FAM, CW, CH } from "./data.js";
import { drawIcon } from "./art.js";

const L = (s) => (window.I18N ? I18N.t(s) : s);
const FONT = '"Nunito", "Manrope", -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
const INK = "#3b2618", PAPER = "#f7ecd6";
export const AW = 2048, AH = 2048, CELLW = 128, CELLH = 174, COLS = 16;
const SC = CELLW / CW;
// оттенки окна с картинкой по категориям
const TINT = { person: ["#fff6e2", "#f2d7a6"], res: ["#fbf3e2", "#e6cfa6"], food: ["#fff2ea", "#f3cbb8"], nature: ["#f2f8e6", "#cfe3b2"], place: ["#eef7fb", "#bfdeea"],
  build: ["#f1f2fb", "#cdd2ef"], enemy: ["#fbecea", "#efc1bc"], idea: ["#fff9e0", "#f2e2a2"], item: ["#f2f5f8", "#d3dce4"], coin: ["#fff8dc", "#f5e0a0"], pack: ["#fbeef8", "#ecc4e2"], site: ["#fff3e0", "#f7d6a0"] };

function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
function fitFont(c, text, max, size, min) {
  let s = size;
  for (; s > min; s -= 0.5) { c.font = `800 ${s}px ${FONT}`; if (c.measureText(text).width <= max) return s; }
  c.font = `800 ${min}px ${FONT}`; return min;
}
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
function badge(c, x, y, col, edge, txt, tcol) {
  c.fillStyle = col; c.beginPath(); c.arc(x, y, 6.5, 0, 6.283); c.fill();
  c.lineWidth = 1.2; c.strokeStyle = edge; c.stroke();
  c.fillStyle = "rgba(255,255,255,.45)"; c.beginPath(); c.arc(x - 2, y - 2.5, 2, 0, 6.283); c.fill();
  c.font = `900 9.5px ${FONT}`; c.fillStyle = tcol; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(String(txt), x, y + 0.5);
}
// лицо карты в координатах 78×106
export function drawFace(c, k, fam) {
  const d = CARDS[k], cat = CATS[d.c], tint = TINT[d.c] || TINT.res;
  const isP = d.c === "person";
  const head = isP && fam != null ? FAM[fam].c : cat.c, headD = isP && fam != null ? FAM[fam].d : cat.d;
  // бумага (во всю ячейку: края карты — сама геометрия)
  c.fillStyle = PAPER; c.fillRect(-2, -2, CW + 4, CH + 4);
  c.fillStyle = c.createPattern(linen(), "repeat"); c.fillRect(0, 0, CW, CH);
  // рамка цвета категории по краю
  c.lineWidth = 5; c.strokeStyle = head; rr(c, 2.5, 2.5, CW - 5, CH - 5, 7); c.stroke();
  c.lineWidth = 1; c.strokeStyle = "rgba(59,38,24,.35)"; rr(c, 5, 5, CW - 10, CH - 10, 5); c.stroke();
  // шапка
  const hg = c.createLinearGradient(0, 0, 0, 22); hg.addColorStop(0, head); hg.addColorStop(1, headD);
  c.fillStyle = hg; rr(c, 4, 4, CW - 8, 18, 4); c.fill();
  c.fillStyle = "rgba(255,255,255,.25)"; c.fillRect(6, 5, CW - 12, 1.5);
  // окно
  rr(c, 8, 25, CW - 16, CH - 45, 6);
  const ig = c.createRadialGradient(CW / 2, 50, 4, CW / 2, 58, 46); ig.addColorStop(0, tint[0]); ig.addColorStop(1, tint[1]);
  c.fillStyle = ig; c.fill();
  c.lineWidth = 1; c.strokeStyle = "rgba(90,58,28,.35)"; c.stroke();
  drawIcon(c, k, (CW - 50) / 2, 27, 50);
  // нижняя кромка
  const bg = c.createLinearGradient(0, CH - 22, 0, CH); bg.addColorStop(0, "rgba(140,96,50,0)"); bg.addColorStop(1, "rgba(140,96,50,.16)");
  c.fillStyle = bg; c.fillRect(0, CH - 22, CW, 22);
  // имя
  const name = L(d.n);
  c.fillStyle = "#fffaf0"; c.textAlign = "center"; c.textBaseline = "middle";
  c.shadowColor = "rgba(40,20,5,.5)"; c.shadowOffsetY = 1; c.shadowBlur = 0;
  fitFont(c, name, CW - 12, 11.5, 8);
  if (c.measureText(name).width > CW - 10) {
    const sp = name.lastIndexOf(" ", Math.ceil(name.length / 2) + 3);
    const a = sp > 0 ? name.slice(0, sp) : name.slice(0, Math.ceil(name.length / 2)), b = sp > 0 ? name.slice(sp + 1) : name.slice(Math.ceil(name.length / 2));
    fitFont(c, a.length > b.length ? a : b, CW - 12, 8.5, 6.5);
    c.fillText(a, CW / 2, 8.5); c.fillText(b, CW / 2, 17);
  } else c.fillText(name, CW / 2, 13.5);
  c.shadowColor = "transparent"; c.shadowOffsetY = 0;
  // значки внизу: цена, сытость, атака/здоровье
  if (d.v != null && d.v > 0) badge(c, CW - 14, CH - 11, "#e9b949", "#8a6216", d.v, "#4a3206");
  if (d.f) badge(c, 14, CH - 11, "#e7645a", "#8a2a22", d.f, "#fff");
  if (d.atk && (isP || d.c === "enemy")) {
    c.font = `900 9px ${FONT}`; c.fillStyle = INK; c.textAlign = "center"; c.textBaseline = "middle";
    c.fillText("⚔" + d.atk + "  ❤" + d.hp, CW / 2, CH - 11);
  }
  if (d.pair) { c.fillStyle = "#3fb8c8"; c.font = `900 9px ${FONT}`; c.fillText("👥", 14, CH - 11); }
  if (isP && fam != null) { c.fillStyle = FAM[fam].c; c.beginPath(); c.arc(12, 13, 3.4, 0, 6.283); c.fill(); c.strokeStyle = "#fff"; c.lineWidth = 1; c.stroke(); }
}

// атлас: ячейки для всех видов (жители — по ячейке на семью). Идеи на стол не попадают — для них ячеек нет.
export const CELL = {};
export function cellOf(k, o) { const key = CARDS[k] && CARDS[k].c === "person" ? k + "|" + (o || 0) : k; return CELL[key] != null ? CELL[key] : 0; }
export function buildAtlas() {
  const cv = document.createElement("canvas"); cv.width = AW; cv.height = AH;
  const c = cv.getContext("2d");
  let n = 0;
  const put = (key, k, fam) => {
    const col = n % COLS, row = Math.floor(n / COLS);
    c.save(); c.translate(col * CELLW, row * CELLH); c.beginPath(); c.rect(0, 0, CELLW, CELLH); c.clip(); c.scale(SC, SC);
    drawFace(c, k, fam); c.restore();
    CELL[key] = n++;
  };
  for (const k in CARDS) {
    const d = CARDS[k];
    if (d.c === "idea") continue;
    if (d.c === "person") { put(k + "|0", k, 0); put(k + "|1", k, 1); }
    else put(k, k);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.flipY = false;
  return { tex, canvas: cv, cells: n };
}

// мелкий атлас значков 512×256: цифры 0–9 (32×44), значки 48×48
export const UI = { digit: [], icon: {} };
export function buildUiAtlas() {
  const W = 512, H = 256;
  const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
  const c = cv.getContext("2d");
  c.textAlign = "center"; c.textBaseline = "middle";
  for (let i = 0; i < 10; i++) {
    const x = i * 34, y = 0;
    c.font = `900 38px ${FONT}`; c.lineWidth = 7; c.strokeStyle = "#2b1d14"; c.strokeText(String(i), x + 17, y + 24); c.fillStyle = "#fff"; c.fillText(String(i), x + 17, y + 24);
    UI.digit[i] = [x / W, y / H, 34 / W, 46 / H];
  }
  const icons = { heart: "❤", coin: "●", pick: "⛏", food: "🍖", pair: "👥", x: "×", shield: "🛡", bolt: "⚡", warn: "!" };
  let i = 0;
  for (const k in icons) {
    const x = (i % 10) * 50, y = 52 + Math.floor(i / 10) * 50;
    c.save();
    if (k === "heart") { c.fillStyle = "#e5484d"; c.strokeStyle = "#2b1d14"; c.lineWidth = 4; heart(c, x + 25, y + 26, 13); c.stroke(); c.fill(); }
    else if (k === "coin") { c.fillStyle = "#f6c945"; c.strokeStyle = "#8a6216"; c.lineWidth = 4; c.beginPath(); c.arc(x + 25, y + 25, 15, 0, 6.283); c.fill(); c.stroke(); c.fillStyle = "#fff5c0"; c.beginPath(); c.arc(x + 20, y + 20, 4, 0, 6.283); c.fill(); }
    else if (k === "x") { c.font = `900 34px ${FONT}`; c.lineWidth = 6; c.strokeStyle = "#2b1d14"; c.strokeText("×", x + 25, y + 25); c.fillStyle = "#fff"; c.fillText("×", x + 25, y + 25); }
    else if (k === "warn") { c.fillStyle = "#ffd34d"; c.strokeStyle = "#2b1d14"; c.lineWidth = 4; c.beginPath(); c.arc(x + 25, y + 25, 17, 0, 6.283); c.fill(); c.stroke(); c.font = `900 28px ${FONT}`; c.fillStyle = "#2b1d14"; c.fillText("!", x + 25, y + 26); }
    else { c.font = `32px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`; c.fillText(icons[k], x + 25, y + 27); }
    c.restore();
    UI.icon[k] = [x / W, y / H, 50 / W, 50 / H];
    i++;
  }
  // полоски: белая скруглённая (для прогресса и здоровья)
  const bx = 0, by = 160;
  c.fillStyle = "#fff"; rr(c, bx + 2, by + 2, 124, 20, 10); c.fill();
  UI.bar = [(bx + 12) / W, (by + 4) / H, 104 / W, 16 / H];
  // кольцо (подсветка цели / курсор)
  c.strokeStyle = "#fff"; c.lineWidth = 7; c.beginPath(); c.arc(200, 200, 40, 0, 6.283); c.stroke();
  UI.ring = [152 / W, 152 / H, 96 / W, 96 / H];
  // мягкое пятно
  const g = c.createRadialGradient(320, 200, 0, 320, 200, 48); g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.5, "rgba(255,255,255,.45)"); g.addColorStop(1, "rgba(255,255,255,0)");
  c.fillStyle = g; c.fillRect(272, 152, 96, 96);
  UI.soft = [272 / W, 152 / H, 96 / W, 96 / H];
  // прямоугольная рамка-свечение (подсветка карты)
  c.save(); c.shadowColor = "#fff"; c.shadowBlur = 10; c.strokeStyle = "#fff"; c.lineWidth = 6; rr(c, 392, 150, 70, 96, 10); c.stroke(); c.restore();
  UI.frame = [382 / W, 140 / H, 90 / W, 116 / H];
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace; tex.flipY = false; tex.anisotropy = 4;
  return tex;
}
function heart(c, x, y, s) { c.beginPath(); c.moveTo(x, y + s * 0.9); c.bezierCurveTo(x - s * 1.6, y - s * 0.1, x - s * 0.7, y - s * 1.2, x, y - s * 0.35); c.bezierCurveTo(x + s * 0.7, y - s * 1.2, x + s * 1.6, y - s * 0.1, x, y + s * 0.9); }

// значок для DOM (книга рецептов, лавка, всплывающие подсказки)
const ICON_URL = new Map();
export function iconURL(k, size) {
  size = size || 44;
  const key = k + "|" + size; let u = ICON_URL.get(key); if (u) return u;
  const c = document.createElement("canvas"); c.width = c.height = size * 2; const x = c.getContext("2d"); drawIcon(x, k, 0, 0, size * 2);
  u = c.toDataURL(); ICON_URL.set(key, u); return u;
}
// маленькая карта для DOM
export function cardURL(k, fam, w) {
  w = w || 78;
  const key = "card|" + k + "|" + fam + "|" + w; let u = ICON_URL.get(key); if (u) return u;
  const c = document.createElement("canvas"); const s = (w * 2) / CW; c.width = w * 2; c.height = Math.round(CH * s);
  const x = c.getContext("2d"); x.save(); rr(x, 0, 0, c.width, c.height, 10 * s); x.clip(); x.scale(s, s); drawFace(x, k, fam); x.restore();
  u = c.toDataURL(); ICON_URL.set(key, u); return u;
}
