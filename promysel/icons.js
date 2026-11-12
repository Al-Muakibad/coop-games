// «Промысел» — значки: товары рисуем снимком 3D-моделей (тот же вид, что в игре), остальное — плоскими фигурами на canvas.
// Получаем: dataURL для интерфейса, атлас пузырей над покупателями и canvas-значки для площадок.
import * as THREE from "three";
import { ITEM_GEO } from "./art.js";
import { figMat } from "./world.js";

export const ICON = {};          // имя → canvas 128×128
export const URL = {};           // имя → dataURL (для <img>)
const S = 128;

export function buildIcons(renderer) {
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight("#ffffff", "#8a96a8", 1.6));
  const dl = new THREE.DirectionalLight("#fff6e8", 2.2); dl.position.set(2, 4, 3); scene.add(dl);
  const cam = new THREE.PerspectiveCamera(26, 1, 0.1, 20);
  const rt = new THREE.WebGLRenderTarget(S, S, { samples: 4 }); rt.texture.colorSpace = THREE.SRGBColorSpace;
  const px = new Uint8Array(S * S * 4);
  const oldT = renderer.toneMapping;
  for (const name in ITEM_GEO) {
    const m = new THREE.Mesh(ITEM_GEO[name](), figMat());
    m.geometry.computeBoundingBox(); const bb = m.geometry.boundingBox, c = new THREE.Vector3(), sz = new THREE.Vector3(); bb.getCenter(c); bb.getSize(sz);
    m.position.sub(c); const piv = new THREE.Group(); piv.add(m); piv.rotation.set(0.5, -0.65, 0.12); scene.add(piv);
    const r = Math.max(sz.x, sz.y, sz.z);
    cam.position.set(0, 0, r * 2.55); cam.lookAt(0, 0, 0);
    renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(scene, cam);
    renderer.readRenderTargetPixels(rt, 0, 0, S, S, px);
    const cv = document.createElement("canvas"); cv.width = cv.height = S; const cx = cv.getContext("2d"); const id = cx.createImageData(S, S);
    for (let y = 0; y < S; y++) id.data.set(px.subarray((S - 1 - y) * S * 4, (S - y) * S * 4), y * S * 4);
    cx.putImageData(id, 0, 0);
    ICON[name] = cv; scene.remove(piv); m.geometry.dispose();
  }
  renderer.setRenderTarget(null); renderer.setClearColor(0x000000, 1); renderer.toneMapping = oldT; rt.dispose();
  drawFlat();
  for (const k in ICON) URL[k] = ICON[k].toDataURL();
}

// плоские значки (улучшения, помощники, постройки)
function cv() { const c = document.createElement("canvas"); c.width = c.height = S; return [c, c.getContext("2d")]; }
function rr(x, cx, y, w, h, r) { x.beginPath(); x.moveTo(cx + r, y); x.arcTo(cx + w, y, cx + w, y + h, r); x.arcTo(cx + w, y + h, cx, y + h, r); x.arcTo(cx, y + h, cx, y, r); x.arcTo(cx, y, cx + w, y, r); x.closePath(); }
function drawFlat() {
  const out = (x) => { x.lineWidth = 6; x.strokeStyle = "rgba(40,30,25,.55)"; x.lineJoin = "round"; };
  let c, x;
  // рюкзак-короб
  [c, x] = cv(); out(x); x.fillStyle = "#b5824f"; rr(x, 30, 26, 68, 82, 14); x.fill(); x.stroke(); x.fillStyle = "#8d5f36"; rr(x, 38, 58, 52, 34, 8); x.fill(); x.fillStyle = "#e8d9b8"; x.fillRect(60, 30, 8, 22); ICON.bag = c;
  // унты
  [c, x] = cv(); out(x); x.fillStyle = "#7b5a43"; x.beginPath(); x.moveTo(38, 18); x.lineTo(74, 18); x.lineTo(76, 76); x.lineTo(110, 86); x.lineTo(110, 108); x.lineTo(30, 108); x.lineTo(34, 70); x.closePath(); x.fill(); x.stroke(); x.fillStyle = "#f4ece0"; rr(x, 32, 14, 46, 18, 8); x.fill(); x.fillStyle = "#c9433a"; x.fillRect(36, 54, 38, 8); ICON.boots = c;
  // сеть
  [c, x] = cv(); x.strokeStyle = "#e0c58e"; x.lineWidth = 5; x.beginPath(); x.arc(64, 60, 40, 0, Math.PI * 2); x.stroke(); x.save(); x.beginPath(); x.arc(64, 60, 38, 0, Math.PI * 2); x.clip(); x.lineWidth = 3; x.strokeStyle = "#f3e7c7";
  for (let i = -6; i <= 6; i++) { x.beginPath(); x.moveTo(20 + i * 12, 10); x.lineTo(80 + i * 12, 110); x.stroke(); x.beginPath(); x.moveTo(108 - i * 12, 10); x.lineTo(48 - i * 12, 110); x.stroke(); } x.restore();
  x.lineWidth = 9; x.strokeStyle = "#7c5233"; x.beginPath(); x.moveTo(92, 90); x.lineTo(116, 118); x.stroke(); ICON.net = c;
  // ящик артели
  [c, x] = cv(); out(x); x.fillStyle = "#c08a58"; rr(x, 22, 40, 84, 62, 8); x.fill(); x.stroke(); x.fillStyle = "#7c5233"; x.fillRect(22, 56, 84, 7); x.fillRect(22, 80, 84, 7); x.fillStyle = "#cdeffd"; rr(x, 30, 26, 68, 18, 8); x.fill(); ICON.crate2 = c;
  // лыжи
  [c, x] = cv(); x.save(); x.translate(64, 64); x.rotate(-0.6); out(x); for (const o of [-16, 16]) { x.fillStyle = "#3f6f8f"; rr(x, -54, o - 7, 108, 14, 7); x.fill(); x.stroke(); } x.restore(); x.fillStyle = "#f4ece0"; x.beginPath(); x.arc(64, 64, 10, 0, 7); x.fill(); ICON.skis = c;
  // помощник (человечек в жилете)
  [c, x] = cv(); out(x); x.fillStyle = "#f2c14e"; rr(x, 34, 56, 60, 58, 22); x.fill(); x.stroke(); x.fillStyle = "#f1c7a5"; x.beginPath(); x.arc(64, 40, 22, 0, 7); x.fill(); x.stroke(); x.fillStyle = "#e0703a"; x.beginPath(); x.arc(64, 30, 22, Math.PI, 0); x.fill(); x.fillStyle = "#2b2622"; x.beginPath(); x.arc(56, 42, 3, 0, 7); x.arc(72, 42, 3, 0, 7); x.fill(); ICON.helper = c;
  // кассир (монеты)
  [c, x] = cv(); out(x); for (let i = 0; i < 4; i++) { x.fillStyle = i % 2 ? "#f2c14e" : "#e8b13c"; rr(x, 30, 84 - i * 16, 68, 18, 9); x.fill(); x.stroke(); } x.fillStyle = "#6fc37a"; rr(x, 56, 20, 52, 30, 6); x.fill(); x.stroke(); ICON.cashier = c;
  // мостки
  [c, x] = cv(); out(x); x.fillStyle = "#4aa3c8"; rr(x, 8, 70, 112, 46, 12); x.fill(); x.fillStyle = "#b48256"; for (let i = 0; i < 5; i++) { rr(x, 46, 14 + i * 20, 36, 16, 3); x.fill(); x.stroke(); } ICON.pier = c;
  // маяк
  [c, x] = cv(); out(x); x.fillStyle = "#c9433a"; x.beginPath(); x.moveTo(48, 112); x.lineTo(54, 44); x.lineTo(74, 44); x.lineTo(80, 112); x.closePath(); x.fill(); x.stroke(); x.fillStyle = "#f4f1ea"; x.fillRect(51, 66, 26, 12); x.fillRect(49, 90, 30, 12); x.fillStyle = "#ffe08a"; rr(x, 50, 24, 28, 20, 4); x.fill(); x.stroke(); x.fillStyle = "#c9433a"; x.beginPath(); x.moveTo(44, 26); x.lineTo(64, 6); x.lineTo(84, 26); x.closePath(); x.fill();
  x.fillStyle = "rgba(255,230,140,.6)"; x.beginPath(); x.moveTo(78, 30); x.lineTo(124, 14); x.lineTo(124, 46); x.closePath(); x.fill(); ICON.light = c;
  // прилавок
  [c, x] = cv(); out(x); x.fillStyle = "#c08a58"; rr(x, 18, 66, 92, 46, 6); x.fill(); x.stroke(); for (let i = 0; i < 5; i++) { x.fillStyle = i % 2 ? "#f4efe4" : "#e2735c"; x.beginPath(); x.moveTo(14 + i * 20, 30); x.lineTo(34 + i * 20, 30); x.lineTo(34 + i * 20, 56); x.arc(24 + i * 20, 56, 10, 0, Math.PI); x.closePath(); x.fill(); } x.strokeRect(14, 30, 100, 26); ICON.stall = c;
  // причал с судном
  [c, x] = cv(); out(x); x.fillStyle = "#2f5d7c"; x.beginPath(); x.moveTo(12, 70); x.lineTo(116, 70); x.lineTo(100, 100); x.lineTo(26, 100); x.closePath(); x.fill(); x.stroke(); x.fillStyle = "#f2efe6"; rr(x, 52, 40, 36, 30, 4); x.fill(); x.stroke(); x.fillStyle = "#c9433a"; x.fillRect(64, 20, 10, 20); ICON.dock = c;
  // доска заказов
  [c, x] = cv(); out(x); x.fillStyle = "#c08a58"; rr(x, 16, 24, 96, 70, 6); x.fill(); x.stroke(); x.fillStyle = "#f7f1e1"; for (let i = 0; i < 3; i++) { x.save(); x.translate(34 + i * 30, 58); x.rotate((i - 1) * 0.12); x.fillRect(-11, -20, 22, 34); x.restore(); } x.fillStyle = "#7c5233"; x.fillRect(26, 92, 8, 26); x.fillRect(94, 92, 8, 26); ICON.board = c;
  // звезда, стрелка «сюда», замок
  [c, x] = cv(); out(x); x.fillStyle = "#f2c14e"; x.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 22 : 50; x.lineTo(64 + Math.cos(a) * r, 66 + Math.sin(a) * r); } x.closePath(); x.fill(); x.stroke(); ICON.star = c;
}

/* ---------- атлас пузырей: 8×8 клеток по 128 px ---------- */
export const BUB = {};       // имя → номер клетки
export function bubbleAtlas() {
  const c = document.createElement("canvas"); c.width = c.height = 1024; const x = c.getContext("2d");
  let n = 0;
  const cell = (name, draw) => { const cx = (n % 8) * 128, cy = Math.floor(n / 8) * 128; x.save(); x.translate(cx, cy); draw(x); x.restore(); BUB[name] = n++; };
  const bubble = (x, fill, stroke) => { x.fillStyle = fill; x.strokeStyle = stroke; x.lineWidth = 5; x.beginPath(); x.moveTo(30, 12); x.arcTo(116, 12, 116, 96, 22); x.arcTo(116, 96, 12, 96, 22); x.lineTo(76, 96); x.lineTo(64, 120); x.lineTo(52, 96); x.arcTo(12, 96, 12, 12, 22); x.arcTo(12, 12, 116, 12, 22); x.closePath(); x.fill(); x.stroke(); };
  for (const k of ["herring", "fillet", "log", "smoked", "salmon", "steak", "caviar", "can", "ice", "crate", "cash"]) cell("i_" + k, (x) => { bubble(x, "#ffffff", "rgba(60,70,90,.35)"); if (ICON[k]) x.drawImage(ICON[k], 20, 10, 88, 88); });
  // сердитый
  cell("angry", (x) => { bubble(x, "#ff6b57", "rgba(120,30,20,.5)"); x.fillStyle = "#fff"; x.strokeStyle = "#fff"; x.lineWidth = 7; x.lineCap = "round";
    x.beginPath(); x.moveTo(38, 38); x.lineTo(56, 46); x.moveTo(90, 38); x.lineTo(72, 46); x.stroke(); x.beginPath(); x.arc(64, 82, 16, Math.PI * 1.15, Math.PI * 1.85); x.stroke(); x.beginPath(); x.arc(47, 56, 5, 0, 7); x.arc(81, 56, 5, 0, 7); x.fill(); });
  // довольный
  cell("happy", (x) => { bubble(x, "#7ed957", "rgba(30,90,20,.5)"); x.strokeStyle = "#fff"; x.fillStyle = "#fff"; x.lineWidth = 7; x.lineCap = "round"; x.beginPath(); x.arc(64, 50, 22, Math.PI * 0.15, Math.PI * 0.85); x.stroke(); x.beginPath(); x.arc(48, 40, 5, 0, 7); x.arc(80, 40, 5, 0, 7); x.fill(); });
  // ушёл к сопернику
  cell("switch", (x) => { bubble(x, "#ffb547", "rgba(120,70,20,.5)"); x.strokeStyle = "#fff"; x.lineWidth = 8; x.lineCap = "round"; x.beginPath(); x.moveTo(36, 54); x.lineTo(90, 54); x.moveTo(74, 36); x.lineTo(92, 54); x.lineTo(74, 72); x.stroke(); });
  for (let d = 1; d <= 9; d++) cell("x" + d, (x) => { x.font = "900 54px Nunito, Arial, sans-serif"; x.textAlign = "center"; x.textBaseline = "middle"; x.lineWidth = 9; x.strokeStyle = "rgba(30,40,60,.85)"; x.strokeText("×" + d, 64, 66); x.fillStyle = "#fff"; x.fillText("×" + d, 64, 66); });
  cell("full", (x) => { x.font = "900 30px Nunito, Arial, sans-serif"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillStyle = "#ff5a4a"; rr(x, 6, 42, 116, 46, 18); x.fill(); x.fillStyle = "#fff"; x.fillText("ПОЛНО", 64, 66); });
  cell("zzz", (x) => { bubble(x, "#dfe9f3", "rgba(60,70,90,.35)"); x.font = "900 40px Nunito, Arial, sans-serif"; x.textAlign = "center"; x.fillStyle = "#6a7a90"; x.fillText("…", 64, 64); });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.anisotropy = 2;
  return t;
}
