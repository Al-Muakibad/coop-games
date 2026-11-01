// Экраны вне боя: главное меню, карта кампании, мастерская (мета-улучшения), настройки, общий «лист» снизу.
import * as D from "./data.js";
import { S, save, locState, stepState, currentStep } from "./save.js";
import * as SE from "./seasons.js";
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
  const cur = currentStep();
  $("m-camp-sub").textContent = `Год ${cur.year} · ${cur.icon} ${cur.name}`;
  $("m-camp").onclick = () => { AU.play("click"); h.onCampaign(); };
  $("m-party").onclick = () => { AU.play("click"); h.onParty(); };
  $("m-meta").onclick = () => { AU.play("click"); showMeta(() => { $("m-gems").textContent = S.gems || 0; }); };
  $("m-set").onclick = () => { AU.play("click"); showSettings(h.onQuality); };
  $("m-back").onclick = () => { location.href = "../"; };
}
export const hideMenu = () => $("menu").classList.add("hidden");

// ---------- карта кампании: колесо времён года ----------
// Год: Весна → Лето → Осень → Зима (у каждого сезона — погода и свои правила), дальше — следующий год, сложнее.
const QA = { spring: [-Math.PI / 2, 0], summer: [0, Math.PI / 2], autumn: [Math.PI / 2, Math.PI], winter: [Math.PI, Math.PI * 1.5] };   // четверти круга (по часовой от «12 часов»)
const wheelCache = {};
function paintWheel(W, H) {
  const key = W + "x" + H; if (wheelCache[key]) return wheelCache[key];
  const cv = document.createElement("canvas"); cv.width = W; cv.height = H; const g = cv.getContext("2d");
  const cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.46, r0 = R * 0.34, S1 = R / 100;
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  // фон: ночное небо со звёздами
  const bg = g.createRadialGradient(cx, cy, R * 0.2, cx, cy, Math.max(W, H) * 0.75); bg.addColorStop(0, "#28324a"); bg.addColorStop(1, "#111724"); g.fillStyle = bg; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(255,255,255,${0.15 + rnd() * 0.5})`; g.beginPath(); g.arc(rnd() * W, rnd() * H, rnd() * 1.4 * S1 * 0.6 + 0.4, 0, 7); g.fill(); }
  // тень колеса
  g.save(); g.shadowColor = "rgba(0,0,0,.55)"; g.shadowBlur = 24 * S1; g.beginPath(); g.arc(cx, cy, R, 0, 7); g.fillStyle = "#3a2c1a"; g.fill(); g.restore();
  const tree = (x, y, s, c1, c2) => { g.fillStyle = "rgba(0,0,0,.2)"; g.beginPath(); g.ellipse(x + s * 0.2, y + s * 0.1, s * 0.6, s * 0.2, 0, 0, 7); g.fill(); g.fillStyle = "#6b4a2b"; g.fillRect(x - s * 0.07, y - s * 0.4, s * 0.14, s * 0.45); g.fillStyle = c1; g.beginPath(); g.arc(x, y - s * 0.72, s * 0.5, 0, 7); g.fill(); g.fillStyle = c2; g.beginPath(); g.arc(x - s * 0.16, y - s * 0.84, s * 0.25, 0, 7); g.fill(); };
  const pine = (x, y, s, c1, c2) => { for (let k = 0; k < 3; k++) { g.fillStyle = k % 2 ? c2 : c1; g.beginPath(); g.moveTo(x, y - s * (1.45 - k * 0.33)); g.lineTo(x - s * (0.33 + k * 0.12), y - s * (0.5 - k * 0.18)); g.lineTo(x + s * (0.33 + k * 0.12), y - s * (0.5 - k * 0.18)); g.fill(); } };
  for (const key of SE.ORDER) {
    const [a0, a1] = QA[key], C = SE.SEASON[key].col;
    g.save(); g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, R, a0, a1); g.closePath(); g.clip();
    const gr = g.createRadialGradient(cx + Math.cos((a0 + a1) / 2) * R * 0.6, cy + Math.sin((a0 + a1) / 2) * R * 0.6, 0, cx, cy, R * 1.1); gr.addColorStop(0, C[0]); gr.addColorStop(1, C[1]); g.fillStyle = gr; g.fillRect(0, 0, W, H);
    // «живописные» значки сезона
    for (let i = 0; i < 26; i++) {
      const a = a0 + 0.08 + rnd() * (a1 - a0 - 0.16), rr = r0 + R * 0.12 + rnd() * (R - r0 - R * 0.2), x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr, s = (5 + rnd() * 4) * S1;
      const mid = (a0 + a1) / 2; if (Math.abs(a - mid) < 0.32 && rr > R * 0.5 && rr < R * 0.78) continue;   // место под медальон
      if (key === "spring") tree(x, y, s, i % 3 ? "#f6b3d0" : "#7cc46a", i % 3 ? "#ffe1ee" : "#a6dc8a");
      else if (key === "summer") { if (i % 4 === 0) { g.strokeStyle = "rgba(170,110,40,.5)"; g.lineWidth = S1 * 1.2; g.beginPath(); g.arc(x, y + s, s * 1.2, Math.PI * 1.15, Math.PI * 1.85); g.stroke(); } else tree(x, y, s, i % 2 ? "#6aa83a" : "#9bbf3a", "#c8dc6a"); }
      else if (key === "autumn") tree(x, y, s, ["#e0782a", "#c94a28", "#e8b23a"][i % 3], "#f4c65a");
      else { if (i % 3 === 0) { g.fillStyle = "#e8f2fb"; g.beginPath(); g.moveTo(x - s, y); g.lineTo(x, y - s * 1.2); g.lineTo(x + s, y); g.fill(); g.fillStyle = "#b8cde0"; g.beginPath(); g.moveTo(x, y - s * 1.2); g.lineTo(x + s, y); g.lineTo(x + s * 0.2, y); g.fill(); } else pine(x, y, s, "#3f6a5a", "#eaf3fb"); }
    }
    g.restore();
    // разделители четвертей
    g.strokeStyle = "rgba(60,40,20,.65)"; g.lineWidth = 3 * S1 * 0.6; g.beginPath(); g.moveTo(cx + Math.cos(a0) * r0, cy + Math.sin(a0) * r0); g.lineTo(cx + Math.cos(a0) * R, cy + Math.sin(a0) * R); g.stroke();
  }
  // обод: золото и «руны» месяцев
  g.lineWidth = 6 * S1 * 0.6; g.strokeStyle = "#e9c46a"; g.beginPath(); g.arc(cx, cy, R, 0, 7); g.stroke();
  g.lineWidth = 2 * S1 * 0.6; g.strokeStyle = "#7a5a1a"; g.beginPath(); g.arc(cx, cy, R + 4 * S1 * 0.6, 0, 7); g.stroke();
  for (let i = 0; i < 12; i++) { const a = -Math.PI / 2 + i / 12 * Math.PI * 2; g.fillStyle = "#e9c46a"; g.beginPath(); g.arc(cx + Math.cos(a) * (R + 9 * S1 * 0.6), cy + Math.sin(a) * (R + 9 * S1 * 0.6), 2.2 * S1 * 0.6, 0, 7); g.fill(); }
  // ступица
  const hub = g.createRadialGradient(cx - r0 * 0.3, cy - r0 * 0.3, 0, cx, cy, r0); hub.addColorStop(0, "#4a3a28"); hub.addColorStop(1, "#22180e"); g.fillStyle = hub; g.beginPath(); g.arc(cx, cy, r0, 0, 7); g.fill();
  g.lineWidth = 4 * S1 * 0.6; g.strokeStyle = "#e9c46a"; g.stroke();
  wheelCache[key] = { cv, cx, cy, R, r0 }; return wheelCache[key];
}
export function showMap(opts) {
  // opts: { title, btn, onPick(stepId), onBack, sel }
  const el = $("map"); el.classList.remove("hidden");
  const maxIdx = S.camp.max, maxYear = SE.STEPS[maxIdx].year;
  let sel = opts.sel && SE.stepIndex(opts.sel) >= 0 && SE.stepIndex(opts.sel) <= maxIdx ? opts.sel : SE.STEPS[maxIdx].id;
  let year = SE.parseStep(sel).y, raf = 0;
  const draw = () => {
    const steps = SE.STEPS.filter((st) => st.year === year);
    const L = D.LOC[sel], st = stepState(sel), R0 = L.reward;
    const nodes = steps.map((sp) => {
      const idx = SE.stepIndex(sp.id), open = idx <= maxIdx, ss = stepState(sp.id), [a0, a1] = QA[sp.season], a = (a0 + a1) / 2;
      const x = 50 + Math.cos(a) * 31, y = 50 + Math.sin(a) * 31 * 0.97;
      return `<button class="mnode ${open ? "" : "lock"} ${sp.id === sel ? "sel" : ""} ${ss.cleared ? "done" : ""}" data-l="${sp.id}" style="left:${x}%;top:${y}%;--bc:${SE.SEASON[sp.season].col[0]};--bd:${SE.SEASON[sp.season].col[1]}">
        <span class="mic"><em>${sp.evIcon}</em>${ss.cleared ? '<b class="mck">✓</b>' : open ? "" : '<b class="mlk">🔒</b>'}</span><span class="mname">${SE.SEASON[sp.season].name}</span>${open ? `<span class="mst">${stars(ss.stars)}</span>` : ""}</button>`;
    }).join("");
    const mons = [...new Set(L.fam.flatMap((f) => D.FAM[f]))].slice(0, 9).map((k) => `<span title="${D.MON[k].name}">${monIcon(k)}</span>`).join("");
    const bossK = Object.values(L.bosses)[0];
    const rw = `🎁 ${st.cleared ? "Повтор: кристаллы и ресурсы" : esc(R0.special.txt)} · 💎 ${R0.gems}+`;
    el.innerHTML = `<div class="map-top"><button class="gbtn" id="map-back">‹ Назад</button><b>${opts.title || "Времена года"}</b><span class="gems">💎 ${S.gems || 0}</span></div>
      <div class="map-area" id="map-area"><canvas id="map-cv"></canvas><canvas id="map-fx"></canvas>
        <div class="yearsw"><button id="y-prev" ${year > 1 ? "" : "disabled"}>‹</button><b>Год ${year}</b><button id="y-next" ${year < maxYear ? "" : "disabled"}>›</button></div>
        ${nodes}</div>
      <div class="map-card"><div class="mc-h"><span class="mc-ic">${L.icon}${L.evIcon}</span><div><b>${esc(L.name)}</b><small>Год ${L.year} · ${stars(st.stars)} · ${st.best ? "рекорд: волна " + st.best : "ещё не пройдено"}${st.cleared ? " · ✔" : ""}</small></div></div>
        <div class="mods">${L.modText.map((t) => `<span>${esc(t)}</span>`).join("")}</div>
        <div class="mc-row"><span>🌊 Волн: <b>${L.waves}</b></span><span>💀 Босс: <b>${D.MON[bossK].name}</b></span></div>
        <div class="mc-mons">${mons}</div>
        <div class="reward">${rw}</div>
        <button class="gbtn primary big" id="map-go">${opts.btn || "⚔️ В бой"}</button></div>`;
    const area = $("map-area"), cv = $("map-cv"), fxc = $("map-fx"), dpr = Math.min(2, devicePixelRatio || 1);
    const w = Math.max(50, Math.round(area.clientWidth * dpr)), h = Math.max(50, Math.round(area.clientHeight * dpr));
    const WH = paintWheel(w, h); cv.width = w; cv.height = h; const cg = cv.getContext("2d"); cg.drawImage(WH.cv, 0, 0);
    // золотая дуга прогресса года
    const done = steps.filter((sp) => stepState(sp.id).cleared).length; cg.lineWidth = 7 * dpr; cg.lineCap = "round"; cg.strokeStyle = "rgba(255,214,110,.95)";
    if (done) { cg.beginPath(); cg.arc(WH.cx, WH.cy, WH.R - 10 * dpr, -Math.PI / 2, -Math.PI / 2 + done / 4 * Math.PI * 2); cg.stroke(); }
    cg.fillStyle = "#ffe9a8"; cg.textAlign = "center"; cg.font = `400 ${Math.round(WH.r0 * 0.36)}px "Russo One", sans-serif`; cg.fillText(`Год ${year}`, WH.cx, WH.cy + WH.r0 * 0.05);
    cg.font = `800 ${Math.round(WH.r0 * 0.2)}px Manrope, sans-serif`; cg.fillStyle = "#e9d7a8"; cg.fillText(`${done} / 4 сезона`, WH.cx, WH.cy + WH.r0 * 0.38);
    fxc.width = w; fxc.height = h; const fg = fxc.getContext("2d");
    const parts = []; for (let i = 0; i < 46; i++) parts.push({ q: SE.ORDER[i % 4], a: Math.random(), r: Math.random(), ph: Math.random() * 10 });
    cancelAnimationFrame(raf);
    const tick = (t) => {
      if (el.classList.contains("hidden") || !document.body.contains(fxc)) return;
      fg.clearRect(0, 0, w, h);
      for (const p of parts) {   // лепестки, искры солнца, листья, снег — каждый в своей четверти
        const [a0, a1] = QA[p.q], fall = ((t / 9000 + p.ph) % 1);
        const a = a0 + 0.1 + p.a * (a1 - a0 - 0.2), rr = WH.r0 + 10 * dpr + p.r * (WH.R - WH.r0 - 20 * dpr), x = WH.cx + Math.cos(a) * rr + Math.sin(t / 700 + p.ph) * 6 * dpr, y = WH.cy + Math.sin(a) * rr + (fall - 0.5) * 30 * dpr;
        fg.globalAlpha = Math.sin(fall * Math.PI) * 0.9;
        if (p.q === "spring") { fg.fillStyle = "#ffd3e6"; fg.beginPath(); fg.ellipse(x, y, 3 * dpr, 1.8 * dpr, t / 600 + p.ph, 0, 7); fg.fill(); }
        else if (p.q === "summer") { fg.fillStyle = "#fff6c0"; fg.beginPath(); fg.arc(x, y, 1.6 * dpr, 0, 7); fg.fill(); }
        else if (p.q === "autumn") { fg.fillStyle = "#f08a2a"; fg.beginPath(); fg.ellipse(x, y, 3.5 * dpr, 2 * dpr, t / 500 + p.ph, 0, 7); fg.fill(); }
        else { fg.fillStyle = "#ffffff"; fg.beginPath(); fg.arc(x, y, 1.8 * dpr, 0, 7); fg.fill(); }
      }
      fg.globalAlpha = 1; raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    el.querySelectorAll(".mnode").forEach((b) => b.onclick = () => { if (b.classList.contains("lock")) { AU.play("error"); toastFn("Сначала пройди предыдущий сезон"); return; } AU.play("select"); sel = b.dataset.l; draw(); });
    $("y-prev").onclick = () => { year--; const f = SE.STEPS.find((sp) => sp.year === year); sel = f.id; AU.play("select"); draw(); };
    $("y-next").onclick = () => { year++; const f = SE.STEPS.find((sp) => sp.year === year); sel = SE.STEPS.filter((sp) => sp.year === year && SE.stepIndex(sp.id) <= maxIdx).pop().id || f.id; AU.play("select"); draw(); };
    $("map-back").onclick = () => { AU.play("close"); cancelAnimationFrame(raf); el.classList.add("hidden"); opts.onBack && opts.onBack(); };
    $("map-go").onclick = () => { AU.play("confirm"); cancelAnimationFrame(raf); el.classList.add("hidden"); opts.onPick(sel); };
  };
  draw();
}
// ---------- сундук наград за сезон ----------
export function showChest(res, L, onDone) {
  const sp = res.special, items = [];
  if (res.gems) items.push(["💎", `+${res.gems}`, "кристаллов"]);
  if (res.res && (res.res.c || res.res.w || res.res.s)) items.push(["🧺", `${res.res.c}🪙 ${res.res.w}🪵 ${res.res.s}🪨`, "в запас героя"]);
  if (sp) {
    if (sp.unlock) items.push(["💰", D.GATHER[sp.unlock] ? D.GATHER[sp.unlock].name : sp.unlock, "новое здание"]);
    if (sp.tower) items.push([D.TURRETS[sp.tower].icon, D.TURRETS[sp.tower].name, "новая башня"]);
    if (sp.tskin) items.push(["🏯", SE.TSKIN[sp.tskin].name, "облик башен"]);
    if (sp.outfit) items.push(["👘", SE.OUTFIT[sp.outfit].name, "наряд героя"]);
    if (sp.banner) items.push(["🚩", SE.BANNER[sp.banner].name, "знамя аванпоста"]);
    if (sp.style) items.push([D.SKINS[sp.style] ? D.SKINS[sp.style].icon : "🏰", D.SKINS[sp.style] ? D.SKINS[sp.style].name : sp.style, "стиль замка"]);
    if (sp.amulet) items.push([D.AMULETS[sp.amulet].icon, D.AMULETS[sp.amulet].name, "амулет — надевается в мастерской"]);
  }
  const el = $("chest"); el.classList.remove("hidden");
  el.innerHTML = `<div class="ch-card"><h2>${L.icon} ${esc(L.name)}</h2><p class="mut">${res.firstClear ? "Сезон пройден!" : "Сезон пройден снова."}${res.newStars ? ` Новых звёзд: ${res.newStars} ⭐.` : ""} Твоя награда:</p>
    <button class="ch-box" id="ch-open"><span>🎁</span><small>Нажми, чтобы открыть</small></button>
    <div class="ch-items hidden" id="ch-items">${items.map(([ic, n, d], i) => `<div class="ch-it" style="animation-delay:${0.15 + i * 0.18}s"><span>${ic}</span><b>${esc(n)}</b><small>${esc(d)}</small></div>`).join("")}</div>
    <button class="gbtn primary big hidden" id="ch-ok">Забрать</button></div>`;
  AU.play("magic");
  const open = () => { if (!$("ch-items").classList.contains("hidden")) return; $("ch-open").classList.add("opened"); AU.play("levelup"); setTimeout(() => { $("ch-open").classList.add("hidden"); $("ch-items").classList.remove("hidden"); $("ch-ok").classList.remove("hidden"); AU.play("buy"); }, 450); };
  $("ch-open").onclick = open; setTimeout(open, 2600);
  $("ch-ok").onclick = () => { AU.play("confirm"); el.classList.add("hidden"); onDone && onDone(); };
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
    const pick = (title, list, ownedSet, cur, attr) => `<div class="sec">${title}</div><div class="cosrow">${Object.entries(list).filter(([k]) => ownedSet[k]).map(([k, o]) => `<button class="tog ${cur === k ? "on" : ""}" data-${attr}="${k}">${esc(o.name)}</button>`).join("")}</div>`;
    const cos = pick("Наряд героя", SE.OUTFIT, S.cos.outs, S.cos.out, "out") + pick("Облик башен", SE.TSKIN, S.cos.tsk, S.cos.ts, "ts") + pick("Знамя аванпоста", SE.BANNER, S.cos.bans, S.cos.ban, "ban")
      + (Object.keys(S.amus).length ? pick("Амулет из наград", Object.fromEntries([["none", { name: "Без амулета" }], ...Object.keys(S.amus).map((k) => [k, D.AMULETS[k]])]), Object.assign({ none: 1 }, S.amus), S.prog.amu, "amu") : "");
    const b = sheet(head("💎 Мастерская", `<span class="gems">💎 ${S.gems || 0}</span>`) + `<div class="sec">Твой герой</div>${heroes}${cos}<p class="hint">Одежда и доспехи героя окрашиваются в цвет твоей команды.</p><div class="sec">Улучшения навсегда</div>${ups}<div class="sec">Стиль аванпоста</div>${skins}<div class="sec">Стартовое оружие</div>${ws}
      <p class="hint">Кристаллы даются за волны, боссов и пройденные локации (больше — за звёзды).</p>`, { tall: true, onClose: onChange });
    b.querySelectorAll("[data-up]").forEach((x) => x.onclick = () => { const k = x.dataset.up, lv = S.up[k] || 0, c = D.META[k].cost[lv]; if (S.gems < c) return; S.gems -= c; S.up[k] = lv + 1; save(); AU.play("upgrade"); draw(); });
    b.querySelectorAll("[data-skin]").forEach((x) => x.onclick = () => { const k = x.dataset.skin, s = D.SKINS[k]; if (!S.skins[k]) { if (S.gems < s.cost) return; S.gems -= s.cost; S.skins[k] = 1; AU.play("buy"); } S.skin = k; save(); draw(); });
    b.querySelectorAll("[data-out]").forEach((x) => x.onclick = () => { S.cos.out = x.dataset.out; save(); AU.play("select"); draw(); });
    b.querySelectorAll("[data-ts]").forEach((x) => x.onclick = () => { S.cos.ts = x.dataset.ts; save(); AU.play("select"); draw(); });
    b.querySelectorAll("[data-ban]").forEach((x) => x.onclick = () => { S.cos.ban = x.dataset.ban; save(); AU.play("select"); draw(); });
    b.querySelectorAll("[data-amu]").forEach((x) => x.onclick = () => { S.prog.amu = x.dataset.amu; save(); AU.play("select"); draw(); });
    b.querySelectorAll("[data-hero]").forEach((x) => x.onclick = () => { S.hero = x.dataset.hero; save(); AU.play("select"); draw(); });
    b.querySelectorAll("[data-w]").forEach((x) => x.onclick = () => { const k = x.dataset.w, c = D.STARTW[k]; if (!S.startw[k]) { if (S.gems < c) return; S.gems -= c; S.startw[k] = 1; AU.play("buy"); } S.wpn = k; S.prog.wpn = k; save(); draw(); });
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
