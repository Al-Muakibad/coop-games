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

// ---------- карта кампании ----------
const NODES = [[18, 82], [44, 71], [72, 62], [40, 47], [70, 32], [36, 16]];   // проценты: x, y
const BIOME_BG = { forest: "#4f8f3a", autumn: "#c0662a", swamp: "#4a6a4a", desert: "#d8b26a", snow: "#cfe2f2", volcano: "#7a2a1a" };
export function showMap(opts) {
  // opts: { title, btn, onPick(locId), onBack, mode: "solo"|"party" }
  const el = $("map"); el.classList.remove("hidden");
  const open = unlocked(D.LOCS);
  let sel = opts.sel && open.has(opts.sel) ? opts.sel : [...open].pop();
  const deco = []; let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  D.LOCS.forEach((l, i) => { const [x, y] = NODES[i]; for (let k = 0; k < 7; k++) { const dx = (rnd() - 0.5) * 30, dy = (rnd() - 0.5) * 14; const ic = { forest: "🌲", autumn: "🍁", swamp: "🌿", desert: "🌴", snow: "🏔️", volcano: "🌋" }[l.id]; deco.push(`<span class="mdeco" style="left:${x + dx}%;top:${y + dy}%;font-size:${14 + rnd() * 12}px;opacity:${0.35 + rnd() * 0.35}">${k % 3 === 2 && l.id !== "volcano" ? "🪨" : ic}</span>`); } });
  let path = "";
  NODES.forEach(([x, y], i) => { if (!i) { path += `M${x} ${y}`; return; } const [px, py] = NODES[i - 1]; const mx = (x + px) / 2 + (i % 2 ? 9 : -9), my = (y + py) / 2; path += ` Q${mx} ${my} ${x} ${y}`; });
  const blobs = D.LOCS.map((l, i) => { const [x, y] = NODES[i]; return `<ellipse cx="${x}" cy="${y}" rx="24" ry="13" fill="${BIOME_BG[l.id]}" opacity=".55" filter="url(#blur)"/>`; }).join("");
  const draw = () => {
    const nodes = D.LOCS.map((l, i) => {
      const st = locState(l.id), isOpen = open.has(l.id), [x, y] = NODES[i];
      return `<button class="mnode ${isOpen ? "" : "lock"} ${l.id === sel ? "sel" : ""} ${st.cleared ? "done" : ""}" data-l="${l.id}" style="left:${x}%;top:${y}%">
        <span class="mic">${isOpen ? l.icon : "🔒"}</span><span class="mname">${esc(l.name)}</span><span class="mst">${stars(st.stars)}</span></button>`;
    }).join("");
    const L = D.LOC[sel], st = locState(sel);
    const mons = [...new Set(L.fam.flatMap((f) => D.FAM[f]))].slice(0, 9).map((k) => `<span title="${D.MON[k].name}">${monIcon(k)}</span>`).join("");
    const bossK = Object.values(L.bosses)[0];
    el.innerHTML = `<div class="map-top"><button class="gbtn" id="map-back">‹ Назад</button><b>${opts.title || "Карта кампании"}</b><span class="gems">💎 ${S.gems || 0}</span></div>
      <div class="map-area"><svg viewBox="0 0 100 100" preserveAspectRatio="none"><defs><filter id="blur"><feGaussianBlur stdDeviation="4"/></filter>
        <linearGradient id="sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a4a6a"/><stop offset="1" stop-color="#1d3550"/></linearGradient></defs>
        <rect width="100" height="100" fill="url(#sea)"/><path d="M8 95 Q2 60 12 35 Q20 8 50 4 Q86 2 92 30 Q99 62 88 92 Q60 100 8 95Z" fill="#c9b88a" opacity=".95"/>
        ${blobs}<path d="${path}" fill="none" stroke="#fff6dd" stroke-width=".9" stroke-dasharray="2 1.6" opacity=".85"/></svg>
        ${deco.join("")}${nodes}</div>
      <div class="map-card"><div class="mc-h"><span class="mc-ic">${L.icon}</span><div><b>${esc(L.name)}</b><small>${stars(st.stars)} · рекорд: волна ${st.best || 0}${st.cleared ? " · ✔ пройдено" : ""}</small></div></div>
        <p>${esc(L.desc)}</p>
        <div class="mc-row"><span>🌊 Волн: <b>${L.waves}</b></span><span>💀 Босс: <b>${D.MON[bossK].name}</b></span></div>
        <div class="mc-mons">${mons}</div>
        <button class="gbtn primary big" id="map-go">${opts.btn || "⚔️ В бой"}</button></div>`;
    el.querySelectorAll(".mnode").forEach((b) => b.onclick = () => { if (b.classList.contains("lock")) { AU.play("error"); toastFn("Сначала пройди предыдущую локацию"); return; } AU.play("select"); sel = b.dataset.l; draw(); });
    $("map-back").onclick = () => { AU.play("close"); el.classList.add("hidden"); opts.onBack && opts.onBack(); };
    $("map-go").onclick = () => { AU.play("confirm"); el.classList.add("hidden"); opts.onPick(sel); };
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
    const b = sheet(head("💎 Мастерская", `<span class="gems">💎 ${S.gems || 0}</span>`) + `<div class="sec">Улучшения навсегда</div>${ups}<div class="sec">Стиль аванпоста</div>${skins}<div class="sec">Стартовое оружие</div>${ws}
      <p class="hint">Кристаллы даются за волны, боссов и пройденные локации (больше — за звёзды).</p>`, { tall: true, onClose: onChange });
    b.querySelectorAll("[data-up]").forEach((x) => x.onclick = () => { const k = x.dataset.up, lv = S.up[k] || 0, c = D.META[k].cost[lv]; if (S.gems < c) return; S.gems -= c; S.up[k] = lv + 1; save(); AU.play("upgrade"); draw(); });
    b.querySelectorAll("[data-skin]").forEach((x) => x.onclick = () => { const k = x.dataset.skin, s = D.SKINS[k]; if (!S.skins[k]) { if (S.gems < s.cost) return; S.gems -= s.cost; S.skins[k] = 1; AU.play("buy"); } S.skin = k; save(); draw(); });
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
