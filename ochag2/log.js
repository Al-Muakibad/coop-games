/* Журнал хода игры для разбора багов. Кольцевой буфер в localStorage (o2_log, ~1500 строк, переживает перезапуск).
   O2LOG.add(msg) · O2LOG.text() · O2LOG.clear(). Ловит ошибки JS и console.error. */
(function () {
  "use strict";
  const KEY = "o2_log", MAX = 1500;
  let buf = [];
  try { buf = JSON.parse(localStorage.getItem(KEY) || "[]"); if (!Array.isArray(buf)) buf = []; } catch (_) { buf = []; }
  let dirty = false, t0 = Date.now();
  const stamp = () => { const d = new Date(); return d.toTimeString().slice(0, 8); };
  function add(msg) {
    buf.push(stamp() + " " + String(msg).slice(0, 400));
    if (buf.length > MAX) buf.splice(0, buf.length - MAX);
    dirty = true;
  }
  function flush() { if (!dirty) return; dirty = false; try { localStorage.setItem(KEY, JSON.stringify(buf)); } catch (_) { buf.splice(0, buf.length >> 1); } }
  setInterval(flush, 3000);
  addEventListener("pagehide", flush); document.addEventListener("visibilitychange", () => { add("vis " + document.visibilityState); flush(); });
  addEventListener("error", (e) => add("ERR " + (e.message || e) + " @" + (e.filename || "").split("/").pop() + ":" + e.lineno));
  addEventListener("unhandledrejection", (e) => add("REJ " + (e.reason && (e.reason.stack || e.reason.message) || e.reason)));
  const ce = console.error.bind(console);
  console.error = function () { try { add("CE " + [].map.call(arguments, (a) => (a && a.stack) || (typeof a === "object" ? JSON.stringify(a) : a)).join(" ")); } catch (_) {} return ce.apply(null, arguments); };
  add("---- open " + new Date().toISOString().slice(0, 16) + " " + (navigator.userAgent.match(/\(([^)]+)\)/) || ["", ""])[1].slice(0, 60));
  window.O2LOG = { add, flush, text: () => buf.join("\n"), clear: () => { buf = []; dirty = true; flush(); }, get n() { return buf.length; } };
})();
