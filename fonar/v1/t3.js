// ЭТАП 3 «Город» — ты менеджер менеджеров. Пошагово (неделя за ход): назначаешь управляющих на районы,
// задаёшь курс (Тихо / Ровно / Напор), проверяешь отчёты аудитом (управляющие могут приворовывать),
// разбираешь события и следишь за вниманием властей. Механика: делегирование и доверие при неполной информации.
import { T3_DISTRICTS, T3_MANAGERS, T3_POLICY, T3_EVENTS, ART_BY } from "./data.js";

const $ = (s, r = document) => r.querySelector(s);
const fmt = (n) => Math.round(n).toLocaleString("ru-RU");
const WIN_DISTRICTS = 5, WIN_INCOME = 4200;

export function createT3(app) {
  const S = app.state.t3;
  const root = $("#t3");
  root.innerHTML = `
  <div class="t3top">
    <div class="t3stat"><small>Неделя</small><b id="t3week"></b></div>
    <div class="t3stat"><small>Внимание властей</small><div class="heat"><i id="t3heat"></i></div></div>
    <div class="t3stat"><small>Репутация</small><b id="t3rep"></b></div>
    <div class="t3stat"><small>Аудиты</small><b id="t3aud"></b></div>
  </div>
  <div class="t3goal" id="t3goal"></div>
  <div class="t3map"><svg viewBox="0 0 410 410" id="t3svg"></svg></div>
  <div class="t3hint" id="t3hint">Тапни район, чтобы назначить управляющего и курс</div>
  <button class="t3end" id="t3end">Завершить неделю ▶</button>
  <div class="t3sheet" id="t3sheet"></div>`;
  const svg = $("#t3svg");

  function mgrState(id) { return (S.mgr[id] ||= { loyal: 0.6, audited: false, lastTrue: 0, lastRep: 0, weeks: 0 }); }
  function dist(id) { return S.d[id]; }
  function avgHeat() { const own = T3_DISTRICTS.filter((d) => dist(d.id).own); return own.length ? own.reduce((s, d) => s + dist(d.id).heat, 0) / own.length : 0; }

  function drawMap() {
    let h = `<defs>
      <pattern id="felt" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill="#123a2c"/><path d="M0 6L6 0" stroke="#174a38" stroke-width="1"/></pattern>
      <filter id="glow"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    </defs>
    <rect x="0" y="0" width="410" height="410" rx="16" fill="url(#felt)"/>
    <path d="M0,60 C80,40 120,70 200,30 C260,0 330,40 410,20" stroke="#2a6a8a" stroke-width="14" fill="none" opacity=".55"/>
    <text x="16" y="34" fill="#9fd0e8" font-size="11" font-style="italic">залив</text>`;
    for (const d of T3_DISTRICTS) {
      const D = dist(d.id), m = D.mgr ? T3_MANAGERS.find((x) => x.id === D.mgr) : null;
      const pol = D.own ? T3_POLICY[D.pol] : null;
      const fill = !D.own ? "#2a2a2a" : D.pol === "push" ? "#7a1a2a" : D.pol === "quiet" ? "#1a2a4a" : "#5a3a1a";
      const heatGlow = D.own && D.heat > 60 ? `filter="url(#glow)" stroke="#ff3a3a"` : `stroke="#d9a93a"`;
      h += `<g class="dist ${S.sel === d.id ? "sel" : ""}" data-id="${d.id}">
        <path d="${d.d}" fill="${fill}" fill-opacity="${D.own ? 0.85 : 0.55}" ${heatGlow} stroke-width="${S.sel === d.id ? 4 : 2}"/>
        <text x="${d.lx}" y="${d.ly - 14}" text-anchor="middle" class="dn">${d.n}</text>
        ${D.own ? `<text x="${d.lx}" y="${d.ly + 4}" text-anchor="middle" class="dp">${pol.ic} ${pol.n}</text>` : `<text x="${d.lx}" y="${d.ly + 4}" text-anchor="middle" class="dp">🔒 ${fmt(d.pot * 1.5)}</text>`}
        ${m ? `<g transform="translate(${d.lx},${d.ly + 26})"><circle r="13" fill="#e8d8b0" stroke="#d9a93a" stroke-width="2"/><text y="5" text-anchor="middle" class="mi">${m.n.split(" ").map((w) => w[0]).join("").slice(0, 2)}</text></g>` : D.own ? `<text x="${d.lx}" y="${d.ly + 30}" text-anchor="middle" class="dp warn">нет управляющего</text>` : ""}
        ${D.own ? `<rect x="${d.lx - 24}" y="${d.ly + 44}" width="48" height="5" rx="2" fill="#000" opacity=".5"/><rect x="${d.lx - 24}" y="${d.ly + 44}" width="${Math.min(48, (D.heat / 100) * 48)}" height="5" rx="2" fill="${D.heat > 70 ? "#ff3a3a" : D.heat > 40 ? "#ffb33a" : "#7ed957"}"/>` : ""}
      </g>`;
    }
    svg.innerHTML = h;
    svg.querySelectorAll(".dist").forEach((g) => g.addEventListener("click", () => { S.sel = g.dataset.id; app.sfx("pick"); drawMap(); sheet(); }));
    $("#t3week").textContent = S.week;
    const ah = avgHeat(); const hb = $("#t3heat"); hb.style.width = Math.min(100, ah) + "%"; hb.style.background = ah > 70 ? "#ff3a3a" : ah > 40 ? "#ffb33a" : "#7ed957";
    $("#t3rep").textContent = "⭐".repeat(Math.max(0, Math.min(5, Math.round(S.rep)))) || "—";
    $("#t3aud").textContent = "🔍".repeat(S.audits) || "—";
    const owned = T3_DISTRICTS.filter((d) => dist(d.id).own).length;
    $("#t3goal").innerHTML = `Цель: <b>${owned}/${WIN_DISTRICTS}</b> районов и доход <b>${fmt(S.lastIncome || 0)}/${fmt(WIN_INCOME)}</b> за неделю`;
  }

  function stars(n) { return "★".repeat(n) + "☆".repeat(5 - n); }
  function sheet() {
    const el = $("#t3sheet");
    if (!S.sel) { el.classList.remove("on"); return; }
    const d = T3_DISTRICTS.find((x) => x.id === S.sel), D = dist(d.id);
    const m = D.mgr ? T3_MANAGERS.find((x) => x.id === D.mgr) : null, ms = m ? mgrState(m.id) : null;
    let h = `<div class="sh-h"><b>${d.n}</b><span>потенциал ${fmt(d.pot)}/нед.</span><button class="x" id="shx">✕</button></div>`;
    if (!D.own) {
      h += `<p class="muted">Здесь пока нет нашего дома. Открой дом и поставь управляющего.</p>
      <button class="gold" id="buyD" ${app.state.money < d.pot * 1.5 ? "disabled" : ""}>🏠 Открыть дом · 💰 ${fmt(d.pot * 1.5)}</button>`;
    } else {
      h += `<div class="heatline">Внимание властей: <div class="heat"><i style="width:${Math.min(100, D.heat)}%;background:${D.heat > 70 ? "#ff3a3a" : D.heat > 40 ? "#ffb33a" : "#7ed957"}"></i></div><b>${Math.round(D.heat)}</b></div>`;
      h += `<div class="pol">${Object.entries(T3_POLICY).map(([k, p]) => `<button data-pol="${k}" class="${D.pol === k ? "on" : ""}"><b>${p.ic} ${p.n}</b><small>${p.d}</small></button>`).join("")}</div>`;
      if (m) {
        h += `<div class="dossier">
          <div class="ph"><span>${m.art}</span></div>
          <div class="dd"><b>${m.n}</b><small>${m.look}</small>
            <div>Опыт <span class="st">${stars(m.exp)}</span></div>
            <div>Лояльность <div class="heat sm"><i style="width:${ms.loyal * 100}%;background:#d9a93a"></i></div></div>
            <div>Честность: <b>${ms.audited ? (m.honest > 0.85 ? "чист ✅" : m.honest > 0.6 ? "подворовывает ⚠️" : "ворует ❌") : "неизвестно ❓"}</b></div>
            <div class="muted">Отчёт прошлой недели: <b>${fmt(ms.lastRep)}</b>${ms.audited && ms.lastTrue ? ` · на деле <b>${fmt(ms.lastTrue)}</b>` : ""}</div>
          </div></div>
          <div class="row2"><button id="audit" ${S.audits <= 0 || !ms.lastRep ? "disabled" : ""}>🔍 Аудит</button><button id="swap">🔁 Сменить</button></div>`;
      } else h += `<p class="warn">Без управляющего район не приносит денег.</p><button class="gold" id="swap">👤 Назначить управляющего</button>`;
    }
    el.innerHTML = h; el.classList.add("on");
    $("#shx").onclick = () => { S.sel = null; drawMap(); sheet(); };
    el.querySelectorAll("[data-pol]").forEach((b) => (b.onclick = () => { D.pol = b.dataset.pol; app.sfx("pick"); drawMap(); sheet(); app.save(); }));
    const bd = $("#buyD"); if (bd) bd.onclick = () => { app.addMoney(-d.pot * 1.5); D.own = true; D.heat = d.heat0; D.pol = "even"; app.sfx("buy"); drawMap(); sheet(); pickMgr(d.id); };
    const sw = $("#swap"); if (sw) sw.onclick = () => pickMgr(d.id);
    const au = $("#audit"); if (au) au.onclick = () => doAudit(m, d);
  }

  function pickMgr(did) {
    const used = new Set(T3_DISTRICTS.map((d) => dist(d.id).mgr).filter(Boolean));
    const pool = T3_MANAGERS.filter((m) => !used.has(m.id) && !S.fired.includes(m.id));
    app.modal(`<h2>Кого поставить на ${T3_DISTRICTS.find((x) => x.id === did).n}?</h2>
      <p class="muted">Найм — 💰 200. Честность видна только после аудита.</p>
      <div class="cards">${pool.map((m) => `<button class="mcard" data-m="${m.id}"><div class="ph sm"><span>${m.art}</span></div><b>${m.n}</b><small>${m.look}</small><span class="st">${stars(m.exp)}</span>${m.amb > 0.7 ? `<em>амбициозен</em>` : ""}</button>`).join("") || "<p>Свободных нет</p>"}</div>
      <button class="ghost" data-close>Отмена</button>`, (box) => {
      box.querySelectorAll("[data-m]").forEach((b) => (b.onclick = () => {
        if (app.state.money < 200) { app.toast("Не хватает денег"); return; }
        app.addMoney(-200); const D = dist(did); D.mgr = b.dataset.m; const ms = mgrState(D.mgr); ms.loyal = 0.6; ms.weeks = 0;
        app.closeModal(); app.sfx("buy"); drawMap(); sheet(); app.save();
      }));
    });
  }

  function doAudit(m, d) {
    S.audits--; const ms = mgrState(m.id); ms.audited = true;
    const skim = ms.lastTrue - ms.lastRep;
    app.sfx(skim > 20 ? "bad" : "ok");
    app.modal(`<div class="stamp ${skim > 20 ? "bad" : ""}">${skim > 20 ? "НЕДОСТАЧА" : "ПРОВЕРЕНО"}</div>
      <h2>Аудит: ${m.n}</h2>
      <p>Отчитался: <b>${fmt(ms.lastRep)}</b><br>На самом деле: <b>${fmt(ms.lastTrue)}</b></p>
      ${skim > 20 ? `<p class="warn">Прикарманил ${fmt(skim)} за неделю.</p>
      <div class="row2"><button class="gold" data-a="fire">Уволить</button><button data-a="warn">Предупредить</button></div>` : `<p class="muted">Всё сходится. Лояльность растёт от доверия.</p><button class="gold" data-close>Хорошо</button>`}`,
      (box) => {
        box.querySelectorAll("[data-a]").forEach((b) => (b.onclick = () => {
          if (b.dataset.a === "fire") { dist(d.id).mgr = null; S.fired.push(m.id); app.toast(`${m.n} уволен. Назначь нового`); }
          else { ms.loyal = Math.max(0, ms.loyal - 0.1); ms.warned = (ms.warned || 0) + 1; app.toast(`${m.n} обещает исправиться`); }
          app.closeModal(); drawMap(); sheet(); app.save();
        }));
      });
    if (skim <= 20) ms.loyal = Math.min(1, ms.loyal + 0.08);
    drawMap(); sheet(); app.save();
  }

  /* ---------- конец недели ---------- */
  function endWeek() {
    let income = 0; const lines = [];
    const repK = 1 + S.rep * 0.04;
    for (const d of T3_DISTRICTS) {
      const D = dist(d.id); if (!D.own) continue;
      const pol = T3_POLICY[D.pol];
      D.mods = (D.mods || []).filter((x) => x.weeks > 0);
      const mod = 1 + D.mods.reduce((s, x) => s + x.inc, 0) + (S.incAll || 0);
      if (!D.mgr) { D.heat = Math.max(0, D.heat + pol.heat * 0.5 - 2); lines.push({ n: d.n, rep: 0, note: "нет управляющего" }); continue; }
      const m = T3_MANAGERS.find((x) => x.id === D.mgr), ms = mgrState(m.id);
      const noise = 0.9 + Math.random() * 0.2;
      const real = d.pot * (0.55 + m.exp * 0.1) * pol.inc * mod * repK * noise;
      const honesty = Math.min(1, m.honest + (ms.warned || 0) * 0.12);
      const skim = real * (1 - honesty) * 0.4 * (1.4 - ms.loyal);
      const rep = real - skim;
      ms.lastTrue = real; ms.lastRep = rep; ms.weeks++;
      income += rep;
      D.heat = Math.max(0, D.heat + pol.heat + real / 900 - (S.bribe ? 5 : 0) - (S.doctor ? 1.5 : 0));
      ms.loyal = Math.max(0, Math.min(1, ms.loyal + (D.pol === "push" ? -0.03 : 0.02) + (S.rep - 2) * 0.01));
      lines.push({ n: d.n, rep, mgr: m.n, pol });
      D.mods.forEach((x) => x.weeks--);
    }
    const upkeep = T3_DISTRICTS.filter((d) => dist(d.id).own).length * 120;
    let costs = (S.bribe ? 150 : 0) + (S.doctor ? 120 : 0) + upkeep;
    app.addMoney(income - costs);
    S.lastIncome = income;
    // облавы
    const raids = [];
    for (const d of T3_DISTRICTS) { const D = dist(d.id); if (D.own && D.heat >= 100) { raids.push(d.n); D.own = false; D.mgr = null; D.heat = 30; app.addMoney(-300); } }
    S.week++; S.audits = 2; S.incAll = 0;
    app.save();
    // отчёт
    app.modal(`<h2>Отчёты за неделю ${S.week - 1}</h2>
      <table class="rep">${lines.map((l) => `<tr><td>${l.n}</td><td class="muted">${l.mgr || ""} ${l.pol ? l.pol.ic : ""}</td><td><b>${l.note ? l.note : "+" + fmt(l.rep)}</b></td></tr>`).join("")}
      ${costs ? `<tr><td>Расходы</td><td class="muted">содержание домов${S.bribe ? ", капитан" : ""}${S.doctor ? ", доктор" : ""}</td><td><b>−${fmt(costs)}</b></td></tr>` : ""}
      <tr class="tot"><td>Итого</td><td></td><td><b>${fmt(income - costs)}</b></td></tr></table>
      ${raids.length ? `<p class="warn">🚨 Облава! Потеряны районы: ${raids.join(", ")} (−300 за каждый)</p>` : ""}
      <p class="muted">Цифры — со слов управляющих. Правду покажет аудит.</p>
      <button class="gold" data-close>Дальше</button>`, null, () => afterReport());
  }
  function afterReport() {
    // бунт амбициозного
    for (const d of T3_DISTRICTS) {
      const D = dist(d.id); if (!D.own || !D.mgr) continue;
      const m = T3_MANAGERS.find((x) => x.id === D.mgr), ms = mgrState(m.id);
      if (m.amb > 0.7 && ms.loyal < 0.35 && ms.weeks > 2) { return coup(d, m, ms); }
    }
    // событие недели
    const pool = T3_EVENTS.filter((e) => !(S.seen || []).includes(e.id));
    if (pool.length && (S.week % 1 === 0)) { const e = pool[Math.floor(Math.random() * pool.length)]; (S.seen ||= []).push(e.id); return event(e); }
    finishTurn();
  }
  function coup(d, m, ms) {
    app.modal(`<div class="evimg"><span>${m.art}</span><small>портрет: ${m.look}</small></div>
      <h2>${m.n} хочет больше</h2><p>«Район держится на мне. Либо моя доля растёт, либо я ухожу — вместе с ${d.n}».</p>
      <div class="row2"><button class="gold" data-a="pay">Дать долю: −15% дохода района</button><button data-a="no">Отказать</button></div>`, (box) => {
      box.querySelectorAll("[data-a]").forEach((b) => (b.onclick = () => {
        const D = dist(d.id);
        if (b.dataset.a === "pay") { (D.mods ||= []).push({ inc: -0.15, weeks: 99 }); ms.loyal = 0.75; app.toast(`${m.n} доволен`); }
        else { D.own = false; D.mgr = null; D.heat = 20; S.fired.push(m.id); app.toast(`${m.n} ушёл к Мадам Вэй и забрал ${d.n}`); app.sfx("bad"); }
        app.closeModal(); finishTurn();
      }));
    });
  }
  function event(e) {
    const art = ART_BY[e.art];
    app.modal(`<div class="evimg ${e.art.startsWith("SC18") ? "x18" : ""}"><span>${e.art.startsWith("SC18") ? "🔞 " : ""}${e.art}</span><small>${art ? art.idea : ""}</small></div>
      <h2>${e.t}</h2><p>${e.d}</p>
      <div class="row2">${e.a.map((a, i) => `<button class="${i ? "" : "gold"}" data-i="${i}">${a.n}</button>`).join("")}</div>`, (box) => {
      box.querySelectorAll("[data-i]").forEach((b) => (b.onclick = () => {
        const ef = e.a[+b.dataset.i].eff;
        if (ef.m) app.addMoney(ef.m);
        if (ef.h) for (const d of T3_DISTRICTS) { const D = dist(d.id); if (D.own) D.heat = Math.max(0, D.heat + ef.h); }
        if (ef.rep) S.rep = Math.max(0, Math.min(5, S.rep + ef.rep));
        if (ef.loy) for (const k of Object.keys(S.mgr)) S.mgr[k].loyal = Math.max(0, Math.min(1, S.mgr[k].loyal + ef.loy));
        if (ef.tag === "bribe") S.bribe = 1;
        if (ef.tag === "doctor") S.doctor = 1;
        if (ef.district) { const D = dist(ef.district); (D.mods ||= []).push({ inc: ef.inc, weeks: ef.weeks }); }
        if (ef.incAll) S.incAll = ef.incAll;
        if (ef.quit) { const own = T3_DISTRICTS.filter((d) => dist(d.id).own); const d = own[Math.floor(Math.random() * own.length)]; if (d) { (dist(d.id).mods ||= []).push({ inc: -0.3, weeks: 3 }); app.toast(`Часть девушек ушла из района ${d.n}`); } }
        if (ef.scene) app.unlockScene(ef.scene, "Сцена в альбоме");
        app.closeModal(); finishTurn();
      }));
    });
  }
  function finishTurn() {
    drawMap(); sheet(); app.save();
    const owned = T3_DISTRICTS.filter((d) => dist(d.id).own).length;
    if (owned >= WIN_DISTRICTS && (S.lastIncome || 0) >= WIN_INCOME && !S.won) {
      S.won = 1; app.save(); app.unlockScene("SC18-T3-END", "Финальная сцена в альбоме");
      app.modal(`<div class="news"><small>ВЕЧЕРНИЙ ВЕСТНИК</small><h1>Город сдался</h1><p>Новый хозяин ночной жизни Порт-Лантерна держит пять районов. Говорят, его следующая цель — столица.</p></div>
        <p class="muted">Этап 4 «Империя» (менеджер городов: каждый город — отдельная игра со своими правилами) — в разработке.</p>
        <button class="gold" data-close>Продолжить править</button>`);
    }
  }

  $("#t3end").onclick = () => { S.sel = null; sheet(); app.sfx("buy"); endWeek(); };
  drawMap(); sheet();
  if (!S.introSeen) { S.introSeen = 1; app.save(); }
  return { refresh() { drawMap(); sheet(); }, show(on) { root.style.display = on ? "flex" : "none"; } };
}
