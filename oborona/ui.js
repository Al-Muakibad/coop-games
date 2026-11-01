// Экраны вне боя: главное меню, карта кампании, мастерская (мета-улучшения), настройки, общий «лист» снизу.
import * as D from "./data.js";
import { S, save, locState, unlocked } from "./save.js";
import * as AU from "./audio.js";

const $ = (id) => document.getElementById(id);
export const esc = (s) => String(s).replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));
const stars = (n, max = 3) => Array.from({ length: max }, (_, i) => `<i class="${i < n ? "on" : ""}">★</i>`).join("");

// ---------- нижний лист: закрывается тапом мимо, свайпом вниз, крестиком (шапка липкая) ----------
let sheetCb = null;
export function sheet(html, opts) {
  opts = opts || {};
  const wrap = $("sheet"), body = $("sheet-body");
  body.innerHTML = html; wrap.className = "on" + (opts.tall ? " tall" : "");
  sheetCb = opts.onClose || null;
  body.scrollTop = 0;
  const x = body.querySelector("[data-x]"); if (x) x.onclick = closeSheet;
  AU.play("open", { vol: 0.5 });
  return body;
}
export function closeSheet() {
  const wrap = $("sheet"); if (!wrap.classList.contains("on")) return;
  wrap.className = ""; const cb = sheetCb; sheetCb = null; cb && cb(); AU.play("close", { vol: 0.4 });
}
export const sheetOpen = () => $("sheet").classList.contains("on");
(function sheetGestures() {
  const wrap = $("sheet"), card = $("sheet-card");
  wrap.addEventListener("pointerdown", (e) => { if (e.target === wrap) closeSheet(); });
  let sy = null, dy = 0;
  card.addEventListener("touchstart", (e) => { const b = $("sheet-body"); if (b.scrollTop > 2 && !e.target.closest(".sh-head")) { sy = null; return; } sy = e.touches[0].clientY; dy = 0; card.style.transition = "none"; }, { passive: true });
  card.addEventListener("touchmove", (e) => { if (sy == null) return; dy = Math.max(0, e.touches[0].clientY - sy); card.style.transform = `translateY(${dy}px)`; }, { passive: true });
  card.addEventListener("touchend", () => { if (sy == null) return; card.style.transition = ""; card.style.transform = ""; if (dy > 70) closeSheet(); sy = null; });
})();
export const head = (title, extra) => `<div class="sh-head"><div class="sh-grip"></div><h3>${title}</h3>${extra || ""}<button class="sh-x" data-x>✕</button></div>`;

// ---------- главное меню ----------
export function showMenu(h) {
  $("menu").classList.remove("hidden");
  $("m-gems").textContent = S.gems || 0;
  const cur = D.LOCS.find((l) => !locState(l.id).cleared) || D.LOCS[D.LOCS.length - 1];
  $("m-camp-sub").textContent = `${cur.icon} ${cur.name}`;
  $("m-camp").onclick = () => { AU.play("click"); h.onCampaign(); };
  $("m-party").onclick = () => { AU.play("click"); h.onParty(); };
  $("m-meta").onclick = () => { AU.play("click"); showMeta(() => { $("m-gems").textContent = S.gems || 0; }); };
  $("m-set").onclick = () => { AU.play("click"); showSettings(h.onQuality); };
  $("m-back").onclick = () => { location.href = "../"; };
}
export const hideMenu = () => $("menu").classList.add("hidden");

// ---------- карта кампании: рисованный остров (канвас), медальоны локаций, облака ----------
const NODES = [[22, 84], [58, 76], [30, 60], [66, 47], [34, 31], [64, 15]];   // проценты: x, y
const BIOME = {
  forest: { c: ["#5f9e3f", "#3f7a2c"], deco: "forest" }, autumn: { c: ["#d98a35", "#b2552a"], deco: "autumn" }, swamp: { c: ["#5f7d4a", "#3c5a3c"], deco: "swamp" },
  desert: { c: ["#e6c27a", "#cf9f55"], deco: "desert" }, snow: { c: ["#eef4fa", "#bcd2e6"], deco: "snow" }, volcano: { c: ["#7a3a2a", "#3e1f1a"], deco: "volcano" }
};
function vnoise(seed) { const h = (i, j) => { const s = Math.sin(i * 127.1 + j * 311.7 + seed * 74.7) * 43758.5453; return s - Math.floor(s); };
  return (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    return (h(xi, yi) * (1 - u) + h(xi + 1, yi) * u) * (1 - v) + (h(xi, yi + 1) * (1 - u) + h(xi + 1, yi + 1) * u) * v; }; }
let mapCache = null;
function paintMap(W, H, prog) {
  const key = W + "x" + H + ":" + prog; if (mapCache && mapCache.key === key) return mapCache.cv;
  const cv = document.createElement("canvas"); cv.width = W; cv.height = H; const g = cv.getContext("2d");
  const n1 = vnoise(3), n2 = vnoise(11), P = (x, y) => [x / 100 * W, y / 100 * H], S = Math.min(W, H) / 100;
  let seed = 99; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  // море
  let gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, "#1f5f7a"); gr.addColorStop(1, "#143f5c"); g.fillStyle = gr; g.fillRect(0, 0, W, H);
  g.strokeStyle = "rgba(255,255,255,.07)"; g.lineWidth = 1.2 * S / 3;
  for (let i = 0; i < 70; i++) { const x = rnd() * W, y = rnd() * H, w = (2 + rnd() * 4) * S; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + w / 2, y - w / 4, x + w, y); g.stroke(); }
  // остров: полярная форма с шумом, вытянута по высоте
  const isl = []; const cx = 50, cy = 50;
  for (let i = 0; i <= 140; i++) { const a = i / 140 * Math.PI * 2, r = 1 + (n1(Math.cos(a) * 1.6 + 5, Math.sin(a) * 1.6 + 5) - 0.5) * 0.32 + (n2(Math.cos(a) * 4 + 9, Math.sin(a) * 4) - 0.5) * 0.08; isl.push([cx + Math.cos(a) * 41 * r, cy + Math.sin(a) * 45.5 * r]); }
  const islPath = (pad) => { g.beginPath(); isl.forEach(([x, y], i) => { const dx = x - cx, dy = y - cy, l = Math.hypot(dx, dy), k = (l + pad) / l; const [px, py] = P(cx + dx * k, cy + dy * k); i ? g.lineTo(px, py) : g.moveTo(px, py); }); g.closePath(); };
  g.save(); g.shadowColor = "rgba(0,0,0,.45)"; g.shadowBlur = 18 * S / 3; islPath(2.2); g.fillStyle = "rgba(160,220,230,.35)"; g.fill(); g.restore();   // мелководье
  islPath(1.2); g.fillStyle = "#f1dfa8"; g.fill();   // пляж
  islPath(0); g.save(); g.clip();
  // биомы: области вокруг локаций с «рваными» границами, оттенки и холмистая светотень (считаем в половинном разрешении)
  const order = D.LOCS.map((l, i) => [l, NODES[i]]);
  { const w2 = Math.ceil(W / 2), h2 = Math.ceil(H / 2), bc = document.createElement("canvas"); bc.width = w2; bc.height = h2; const bg = bc.getContext("2d"), im = bg.createImageData(w2, h2), d = im.data;
    const hex = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
    const cols = D.LOCS.map((l) => BIOME[l.id].c.map(hex));
    for (let y = 0; y < h2; y++) for (let x = 0; x < w2; x++) {
      const X = x / w2 * 100, Y = y / h2 * 100, wob = (n1(X * 0.09, Y * 0.09) - 0.5) * 16 + (n2(X * 0.3, Y * 0.3) - 0.5) * 4;
      let b1 = 0, b2 = 0, d1 = 1e9, d2 = 1e9;
      for (let i = 0; i < NODES.length; i++) { const dd = Math.hypot(X - NODES[i][0], (Y - NODES[i][1]) * 1.25) + wob * (i % 2 ? 1 : -1); if (dd < d1) { d2 = d1; b2 = b1; d1 = dd; b1 = i; } else if (dd < d2) { d2 = dd; b2 = i; } }
      const t = Math.min(1, (d2 - d1) / 5) * 0.5 + 0.5, v = n2(X * 0.12 + 4, Y * 0.12), sh = (n1(X * 0.2 + 1, Y * 0.2) - n1(X * 0.2 + 1.6, Y * 0.2 + 0.6)) * 0.55 + 1;
      const k = (y * w2 + x) * 4;
      for (let c = 0; c < 3; c++) { const ca = cols[b1][0][c] * (1 - v) + cols[b1][1][c] * v, cb = cols[b2][0][c] * (1 - v) + cols[b2][1][c] * v; d[k + c] = Math.max(0, Math.min(255, (ca * t + cb * (1 - t)) * sh + (Math.random() - 0.5) * 7)); }
      d[k + 3] = 255;
    }
    bg.putImageData(im, 0, 0); g.imageSmoothingEnabled = true; g.drawImage(bc, 0, 0, W, H);
  }
  // река: от снежного перевала к морю
  g.strokeStyle = "#4f9fc4"; g.lineWidth = 2.2 * S; g.lineCap = "round"; g.beginPath(); let [rx, ry] = P(40, 30); g.moveTo(rx, ry);
  [[46, 38], [52, 44], [48, 54], [56, 62], [70, 66], [90, 70]].forEach(([x, y]) => { const [px, py] = P(x, y); g.lineTo(px + (rnd() - 0.5) * 6, py); }); g.stroke();
  g.strokeStyle = "rgba(255,255,255,.35)"; g.lineWidth = 0.6 * S; g.stroke();
  g.restore();
  // береговая пена
  islPath(0.3); g.strokeStyle = "rgba(255,255,255,.55)"; g.lineWidth = 0.8 * S; g.stroke();
  // декор биомов (рисованные значки)
  const tree = (x, y, s, c1, c2) => { g.fillStyle = "rgba(0,0,0,.18)"; g.beginPath(); g.ellipse(x + s * 0.3, y + s * 0.15, s * 0.7, s * 0.25, 0, 0, 7); g.fill(); g.fillStyle = "#6b4a2b"; g.fillRect(x - s * 0.08, y - s * 0.4, s * 0.16, s * 0.45); g.fillStyle = c1; g.beginPath(); g.arc(x, y - s * 0.75, s * 0.55, 0, 7); g.fill(); g.fillStyle = c2; g.beginPath(); g.arc(x - s * 0.18, y - s * 0.88, s * 0.28, 0, 7); g.fill(); };
  const pine = (x, y, s, c1, c2) => { g.fillStyle = "rgba(0,0,0,.18)"; g.beginPath(); g.ellipse(x + s * 0.25, y + s * 0.1, s * 0.5, s * 0.2, 0, 0, 7); g.fill(); for (let k = 0; k < 3; k++) { g.fillStyle = k % 2 ? c2 : c1; g.beginPath(); g.moveTo(x, y - s * (1.5 - k * 0.35)); g.lineTo(x - s * (0.35 + k * 0.12), y - s * (0.55 - k * 0.2)); g.lineTo(x + s * (0.35 + k * 0.12), y - s * (0.55 - k * 0.2)); g.fill(); } };
  const mount = (x, y, s, snowy) => { g.fillStyle = "#7d8a98"; g.beginPath(); g.moveTo(x - s, y); g.lineTo(x, y - s * 1.3); g.lineTo(x + s, y); g.fill(); g.fillStyle = "#5c6876"; g.beginPath(); g.moveTo(x, y - s * 1.3); g.lineTo(x + s, y); g.lineTo(x + s * 0.2, y); g.fill(); if (snowy) { g.fillStyle = "#fbfdff"; g.beginPath(); g.moveTo(x, y - s * 1.3); g.lineTo(x - s * 0.38, y - s * 0.8); g.lineTo(x - s * 0.1, y - s * 0.88); g.lineTo(x + s * 0.12, y - s * 0.76); g.lineTo(x + s * 0.38, y - s * 0.8); g.fill(); } };
  const palm = (x, y, s) => { g.strokeStyle = "#8a6a44"; g.lineWidth = s * 0.14; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + s * 0.2, y - s * 0.6, x + s * 0.1, y - s * 1.1); g.stroke(); g.fillStyle = "#3f8a3a"; for (let k = 0; k < 5; k++) { const a = -Math.PI / 2 + (k - 2) * 0.7; g.beginPath(); g.ellipse(x + s * 0.1 + Math.cos(a) * s * 0.35, y - s * 1.1 + Math.sin(a) * s * 0.2 + s * 0.1, s * 0.4, s * 0.1, a, 0, 7); g.fill(); } };
  const skip = (x, y) => NODES.some(([nx, ny]) => Math.abs(nx - x) < 13 && y > ny - 7 && y < ny + 9);
  for (const [l, [x0, y0]] of order) for (let k = 0; k < 34; k++) {
    const x = x0 + (rnd() - 0.5) * 44, y = y0 + (rnd() - 0.5) * 20; if (skip(x, y) || Math.hypot((x - 50) / 41, (y - 50) / 45.5) > 0.86) continue;
    let near = 0, bd = 1e9; NODES.forEach(([nx, ny], ii) => { const dd = Math.hypot(nx - x, (ny - y) * 1.25); if (dd < bd) { bd = dd; near = ii; } }); if (D.LOCS[near].id !== l.id) continue;
    const [px, py] = P(x, y), s = (2.0 + rnd() * 1.5) * S;
    if (l.id === "forest") (k % 3 ? pine : tree)(px, py, s, k % 3 ? "#2f6b2a" : "#4f9a38", k % 3 ? "#3f8a35" : "#6fb84a");
    else if (l.id === "autumn") tree(px, py, s, ["#e0782a", "#c94a28", "#e8b23a"][k % 3], "#f4c65a");
    else if (l.id === "swamp") { if (k % 2) { g.fillStyle = "rgba(40,70,60,.75)"; g.beginPath(); g.ellipse(px, py, s * 1.1, s * 0.45, 0, 0, 7); g.fill(); g.strokeStyle = "#7a9a4a"; g.lineWidth = S * 0.3; for (let q = 0; q < 3; q++) { g.beginPath(); g.moveTo(px + s * (q - 1) * 0.5, py); g.lineTo(px + s * (q - 1) * 0.55, py - s * 0.8); g.stroke(); } } else tree(px, py, s * 0.9, "#4a6a3a", "#5f7f45"); }
    else if (l.id === "desert") { if (k % 3 === 0) palm(px, py, s * 1.1); else { g.strokeStyle = "rgba(170,120,60,.55)"; g.lineWidth = S * 0.45; g.beginPath(); g.arc(px, py + s, s * 1.3, Math.PI * 1.15, Math.PI * 1.85); g.stroke(); } }
    else if (l.id === "snow") { if (k % 2) mount(px, py, s * 1.3, true); else pine(px, py, s * 0.9, "#4a7a6a", "#eaf3fb"); }
    else if (l.id === "volcano") { if (k % 4 === 0) mount(px, py, s * 1.1, false); else { g.fillStyle = "#2a1a16"; g.beginPath(); g.arc(px, py, s * 0.35, 0, 7); g.fill(); g.fillStyle = "rgba(255,120,40,.6)"; g.fillRect(px - s * 0.5, py + s * 0.2, s, S * 0.3); } }
  }
  // вулкан с лавой у последней локации
  { const [vx, vy] = P(NODES[5][0] + 14, NODES[5][1] - 1), s = 7 * S; mount(vx, vy, s, false); const lg = g.createRadialGradient(vx, vy - s * 1.25, 0, vx, vy - s * 1.25, s * 0.8); lg.addColorStop(0, "rgba(255,200,80,.95)"); lg.addColorStop(1, "rgba(255,80,20,0)"); g.fillStyle = lg; g.fillRect(vx - s, vy - s * 2.1, s * 2, s * 1.6); g.strokeStyle = "#ff7a2a"; g.lineWidth = S * 0.6; g.beginPath(); g.moveTo(vx, vy - s * 1.25); g.quadraticCurveTo(vx + s * 0.3, vy - s * 0.6, vx + s * 0.15, vy); g.stroke(); }
  // дорога: мягкая тень, коричневая полоса, пунктир; пройденная часть — золотом
  const pts = NODES.map(([x, y]) => P(x, y));
  const road = (from, to) => { g.beginPath(); g.moveTo(...pts[from]); for (let i = from + 1; i <= to; i++) { const [x, y] = pts[i], [px, py] = pts[i - 1], mx = (x + px) / 2 + (i % 2 ? 1 : -1) * 11 * S, my = (y + py) / 2 + 2 * S; g.quadraticCurveTo(mx, my, x, y); } };
  road(0, 5); g.strokeStyle = "rgba(0,0,0,.25)"; g.lineWidth = 2.6 * S; g.lineCap = "round"; g.stroke();
  road(0, 5); g.strokeStyle = "#a07a4a"; g.lineWidth = 1.7 * S; g.stroke();
  road(0, 5); g.setLineDash([1.6 * S, 1.6 * S]); g.strokeStyle = "rgba(255,240,200,.55)"; g.lineWidth = 0.6 * S; g.stroke(); g.setLineDash([]);
  if (prog > 0) { road(0, Math.min(5, prog)); g.strokeStyle = "rgba(255,214,110,.95)"; g.lineWidth = 0.9 * S; g.setLineDash([2.2 * S, 1.2 * S]); g.stroke(); g.setLineDash([]); }
  // роза ветров
  { const [x, y] = P(86, 90), r = 6 * S; g.save(); g.translate(x, y); g.fillStyle = "rgba(255,245,220,.85)"; g.strokeStyle = "rgba(60,40,20,.6)"; g.lineWidth = S * 0.3;
    for (let k = 0; k < 4; k++) { g.rotate(Math.PI / 2); g.beginPath(); g.moveTo(0, -r); g.lineTo(r * 0.22, 0); g.lineTo(-r * 0.22, 0); g.closePath(); g.fill(); g.stroke(); }
    g.fillStyle = "#c0392b"; g.beginPath(); g.moveTo(0, -r); g.lineTo(r * 0.22, 0); g.lineTo(0, 0); g.fill(); g.font = `800 ${2.6 * S}px Manrope, sans-serif`; g.textAlign = "center"; g.fillStyle = "#fff6dd"; g.fillText("С", 0, -r - S); g.restore(); }
  mapCache = { key, cv }; return cv;
}
export function showMap(opts) {
  // opts: { title, btn, onPick(locId), onBack, sel }
  const el = $("map"); el.classList.remove("hidden");
  const open = unlocked(D.LOCS), prog = D.LOCS.filter((l) => open.has(l.id)).length - 1;
  let sel = opts.sel && open.has(opts.sel) ? opts.sel : [...open].pop();
  let raf = 0;
  const draw = () => {
    const nodes = D.LOCS.map((l, i) => {
      const st = locState(l.id), isOpen = open.has(l.id), [x, y] = NODES[i];
      return `<button class="mnode ${isOpen ? "" : "lock"} ${l.id === sel ? "sel" : ""} ${st.cleared ? "done" : ""}" data-l="${l.id}" style="left:${x}%;top:${y}%;--bc:${BIOME[l.id].c[0]};--bd:${BIOME[l.id].c[1]}">
        <span class="mic"><em>${l.icon}</em>${st.cleared ? '<b class="mck">✓</b>' : isOpen ? "" : '<b class="mlk">🔒</b>'}</span><span class="mname">${esc(l.name)}</span>${isOpen ? `<span class="mst">${stars(st.stars)}</span>` : ""}</button>`;
    }).join("");
    const L = D.LOC[sel], st = locState(sel);
    const mons = [...new Set(L.fam.flatMap((f) => D.FAM[f]))].slice(0, 9).map((k) => `<span title="${D.MON[k].name}">${monIcon(k)}</span>`).join("");
    const bossK = Object.values(L.bosses)[0];
    el.innerHTML = `<div class="map-top"><button class="gbtn" id="map-back">‹ Назад</button><b>${opts.title || "Карта кампании"}</b><span class="gems">💎 ${S.gems || 0}</span></div>
      <div class="map-area" id="map-area"><canvas id="map-cv"></canvas><canvas id="map-fx"></canvas>
        <div class="mcloud" style="top:8%;--d:46s;--o:.55"></div><div class="mcloud" style="top:38%;--d:62s;--o:.4;animation-delay:-20s"></div><div class="mcloud" style="top:70%;--d:54s;--o:.45;animation-delay:-38s"></div>
        ${nodes}</div>
      <div class="map-card"><div class="mc-h"><span class="mc-ic">${L.icon}</span><div><b>${esc(L.name)}</b><small>${stars(st.stars)} · ${st.best ? "рекорд: волна " + st.best : "ещё не пройдено"}${st.cleared ? " · ✔ пройдено" : ""}</small></div></div>
        <p>${esc(L.desc)}</p>
        <div class="mc-row"><span>🌊 Волн: <b>${L.waves}</b></span><span>💀 Босс: <b>${D.MON[bossK].name}</b></span></div>
        <div class="mc-mons">${mons}</div>
        <button class="gbtn primary big" id="map-go">${opts.btn || "⚔️ В бой"}</button></div>`;
    // рисуем остров под размер области
    const area = $("map-area"), cv = $("map-cv"), fxc = $("map-fx"), dpr = Math.min(2, devicePixelRatio || 1);
    const w = Math.max(50, Math.round(area.clientWidth * dpr)), h = Math.max(50, Math.round(area.clientHeight * dpr));
    cv.width = w; cv.height = h; cv.getContext("2d").drawImage(paintMap(w, h, prog), 0, 0);
    fxc.width = w; fxc.height = h; const fg = fxc.getContext("2d");
    // блики на воде и мерцание лавы — лёгкая анимация, пока карта открыта
    const sp = []; for (let i = 0; i < 28; i++) sp.push([Math.random(), Math.random(), Math.random() * 6]);
    cancelAnimationFrame(raf);
    const tick = (t) => {
      if (el.classList.contains("hidden") || !document.body.contains(fxc)) return;
      fg.clearRect(0, 0, w, h);
      for (const [x, y, ph] of sp) { const a = Math.max(0, Math.sin(t / 900 + ph)) * 0.5; if (a < 0.02) continue; const px = x * w, py = y * h; if (Math.hypot(x - 0.5, (y - 0.5) * 0.93) < 0.47) continue; fg.strokeStyle = `rgba(255,255,255,${a})`; fg.lineWidth = dpr; fg.beginPath(); fg.moveTo(px - 6 * dpr, py); fg.lineTo(px + 6 * dpr, py); fg.stroke(); }
      const [vx, vy] = [(NODES[5][0] + 14) / 100 * w, (NODES[5][1] - 1) / 100 * h - Math.min(w, h) / 100 * 9]; const a = 0.35 + 0.25 * Math.sin(t / 300);
      const lg = fg.createRadialGradient(vx, vy, 0, vx, vy, 22 * dpr); lg.addColorStop(0, `rgba(255,170,60,${a})`); lg.addColorStop(1, "rgba(255,80,20,0)"); fg.fillStyle = lg; fg.fillRect(vx - 22 * dpr, vy - 22 * dpr, 44 * dpr, 44 * dpr);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    el.querySelectorAll(".mnode").forEach((b) => b.onclick = () => { if (b.classList.contains("lock")) { AU.play("error"); toastFn("Сначала пройди предыдущую локацию"); return; } AU.play("select"); sel = b.dataset.l; draw(); });
    $("map-back").onclick = () => { AU.play("close"); cancelAnimationFrame(raf); el.classList.add("hidden"); opts.onBack && opts.onBack(); };
    $("map-go").onclick = () => { AU.play("confirm"); cancelAnimationFrame(raf); el.classList.add("hidden"); opts.onPick(sel); };
  };
  draw();
}
export const hideMap = () => $("map").classList.add("hidden");
let toastFn = () => {};
export function setToast(f) { toastFn = f; }
export function monIcon(k) { return { walker: "💀", runner: "💀", caster: "🧙", brute: "🪓", orc: "👹", orc_archer: "🏹", orc_brute: "👺", zombie: "🧟", bomber: "💣", spider: "🕷️", rat: "🐀", frog: "🐸", slime: "🟢", bat: "🦇", wasp: "🐝", dragonling: "🐲", boss_skel: "☠️", boss_orc: "👹", boss_spider: "🕷️", boss_dragon: "🐉", boss_giant: "🧊" }[k] || "👾"; }

// ---------- мастерская: кристаллы → постоянные улучшения, стили дома, стартовое оружие ----------
export function showMeta(onChange) {
  const draw = () => {
    const ups = Object.entries(D.META).map(([k, m]) => {
      const lv = S.up[k] || 0, cost = m.cost[lv], can = cost != null && S.gems >= cost;
      return `<div class="it"><div class="ic">${m.icon}</div><div class="tx2"><b>${m.name} <span class="pips">${Array.from({ length: m.max }, (_, i) => `<i class="${i < lv ? "on" : ""}"></i>`).join("")}</span></b><span>${m.desc}</span></div>
        ${cost != null ? `<button ${can ? "" : "disabled"} data-up="${k}">💎 ${cost}</button>` : `<button disabled>МАКС</button>`}</div>`;
    }).join("");
    const skins = Object.entries(D.SKINS).map(([k, s]) => {
      const own = S.skins[k], on = S.skin === k;
      return `<div class="it ${on ? "own" : ""}"><div class="ic">${s.icon}</div><div class="tx2"><b>${s.name}</b><span>Стиль твоего аванпоста</span></div>
        <button ${!own && S.gems < s.cost ? "disabled" : ""} data-skin="${k}">${on ? "✔ Выбран" : own ? "Выбрать" : "💎 " + s.cost}</button></div>`;
    }).join("");
    const ws = Object.entries(D.STARTW).map(([k, cost]) => {
      const w = D.WEAPONS[k], own = S.startw[k], on = S.wpn === k;
      return `<div class="it ${on ? "own" : ""}"><div class="ic">${w.icon}</div><div class="tx2"><b>${w.name}</b><span>${w.desc}</span></div>
        <button ${!own && S.gems < cost ? "disabled" : ""} data-w="${k}">${on ? "✔ С ним" : own ? "Взять" : "💎 " + cost}</button></div>`;
    }).join("");
    const heroes = `<div class="slots">${D.HEROES.map((k) => { const h = D.HERO_INFO[k]; return `<button class="slot ${S.hero === k ? "sel" : ""}" data-hero="${k}"><span class="ic">${h.icon}</span>${h.name}<small>${S.hero === k ? "✔ выбран" : h.desc}</small></button>`; }).join("")}</div>`;
    const b = sheet(head("💎 Мастерская", `<span class="gems">💎 ${S.gems || 0}</span>`) + `<div class="sec">Твой герой</div>${heroes}<p class="hint">Одежда и доспехи героя окрашиваются в цвет твоей команды.</p><div class="sec">Улучшения навсегда</div>${ups}<div class="sec">Стиль аванпоста</div>${skins}<div class="sec">Стартовое оружие</div>${ws}
      <p class="hint">Кристаллы даются за волны, боссов и пройденные локации (больше — за звёзды).</p>`, { tall: true, onClose: onChange });
    b.querySelectorAll("[data-up]").forEach((x) => x.onclick = () => { const k = x.dataset.up, lv = S.up[k] || 0, c = D.META[k].cost[lv]; if (S.gems < c) return; S.gems -= c; S.up[k] = lv + 1; save(); AU.play("upgrade"); draw(); });
    b.querySelectorAll("[data-skin]").forEach((x) => x.onclick = () => { const k = x.dataset.skin, s = D.SKINS[k]; if (!S.skins[k]) { if (S.gems < s.cost) return; S.gems -= s.cost; S.skins[k] = 1; AU.play("buy"); } S.skin = k; save(); draw(); });
    b.querySelectorAll("[data-hero]").forEach((x) => x.onclick = () => { S.hero = x.dataset.hero; save(); AU.play("select"); draw(); });
    b.querySelectorAll("[data-w]").forEach((x) => x.onclick = () => { const k = x.dataset.w, c = D.STARTW[k]; if (!S.startw[k]) { if (S.gems < c) return; S.gems -= c; S.startw[k] = 1; AU.play("buy"); } S.wpn = k; save(); draw(); });
  };
  draw();
}

// ---------- настройки ----------
export function showSettings(onQuality, inGame) {
  const q = S.set.q;
  const b = sheet(head("⚙️ Настройки") + `
    <div class="setrow"><span>🎵 Музыка</span><input type="range" min="0" max="1" step="0.05" value="${S.set.music}" id="s-mus"></div>
    <div class="setrow"><span>🔊 Звуки</span><input type="range" min="0" max="1" step="0.05" value="${S.set.sfx}" id="s-sfx"></div>
    <div class="sec">Графика</div><div class="seg">${[["a", "Авто"], ["0", "Низкая"], ["1", "Средняя"], ["2", "Высокая"]].map(([k, n]) => `<button class="${String(q) === k ? "on" : ""}" data-q="${k}">${n}</button>`).join("")}</div>
    <div class="setrow"><span>📳 Вибрация</span><button class="tog ${S.set.vib ? "on" : ""}" id="s-vib">${S.set.vib ? "Вкл" : "Выкл"}</button></div>
    ${inGame ? `<button class="gbtn danger" id="s-quit">🏳️ Выйти из боя</button>` : ""}`);
  $("s-mus").oninput = (e) => { S.set.music = +e.target.value; AU.applyVol(); save(); };
  $("s-sfx").oninput = (e) => { S.set.sfx = +e.target.value; AU.applyVol(); save(); };
  $("s-sfx").onchange = () => AU.play("coin");
  b.querySelectorAll("[data-q]").forEach((x) => x.onclick = () => { S.set.q = x.dataset.q; save(); b.querySelectorAll("[data-q]").forEach((y) => y.classList.toggle("on", y === x)); onQuality && onQuality(); });
  $("s-vib").onclick = (e) => { S.set.vib = S.set.vib ? 0 : 1; save(); e.target.classList.toggle("on", !!S.set.vib); e.target.textContent = S.set.vib ? "Вкл" : "Выкл"; };
  if (inGame) $("s-quit").onclick = () => { closeSheet(); inGame(); };
}
