// «Промысел» — надёжное подключение поверх общих комнат (shared/net.js).
// Беда публичных серверов-посредников (MQTT-брокеров): один телефон достучался до первого сервера, другой — только до второго,
// и они «не видят» друг друга («комната не найдена», вечное «подключение»). Поэтому хозяин держит комнату сразу на всех
// серверах с одним и тем же кодом, а гость стучится во все сразу: встречаются на том, что доступен обоим; лишние закрываем.
const DEF = ["wss://broker.emqx.io:8084/mqtt", "wss://broker.hivemq.com:8884/mqtt", "wss://test.mosquitto.org:8081/mqtt"];
const ALPH = "abcdefghijkmnpqrstuvwxyz23456789";
export const newRoomId = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => ALPH[b % 32]).join("");
export const validCode = (s) => /^[a-z0-9]{6}$/.test(String(s || "").trim().toLowerCase());
// списки серверов: в автотестах задан свой (window.NET_BROKERS) — тогда один
const lists = () => window.NET_BROKER_SET || (window.NET_BROKERS ? [window.NET_BROKERS] : DEF.map((u) => [u]));      // NET_BROKER_SET — для автотестов
// открыть комнату на конкретном сервере: Net.open читает список серверов сразу при вызове
function openOn(list, game, id, opts) { const save = window.NET_BROKERS; window.NET_BROKERS = list; try { return window.Net.open(game, id, opts); } finally { window.NET_BROKERS = save; } }

// хозяин: комната с кодом id на всех серверах. onPeer(room) — когда друг зашёл (остальные копии комнаты закрываются)
export function hostRoom(game, id, name, onPeer) {
  const all = lists(), rooms = [], st = { id, ok: 0, fail: 0, n: all.length, won: null, closed: false };
  let readyRes; st.ready = new Promise((r) => (readyRes = r));
  const win = (r) => { if (st.won || st.closed) return; st.won = r; for (const o of rooms) if (o !== r) { try { o.close(); } catch (_) {} } onPeer && onPeer(r); };
  all.forEach((list) => openOn(list, game, id, { name, host: true }).then((r) => {
    if (st.closed || st.won) { try { r.close(); } catch (_) {} return; }
    rooms.push(r); st.ok++; readyRes(true);
    if (r.peer) win(r); else r.on("peer", () => win(r));
  }).catch(() => { st.fail++; if (st.fail >= st.n) readyRes(false); }));
  st.close = () => { st.closed = true; for (const o of rooms) if (o !== st.won) { try { o.close(); } catch (_) {} } };
  return st;
}
// гость: стучимся по коду во все серверы; кто первым увидел хозяина — тот и канал. Комнаты сами повторяют «привет» каждые 2 с.
export function joinRoom(game, id, name, onPeer) {
  const all = lists(), rooms = [], st = { id, ok: 0, fail: 0, n: all.length, won: null, closed: false };
  const win = (r) => { if (st.won || st.closed) return; st.won = r; for (const o of rooms) if (o !== r) { try { o.close(); } catch (_) {} } onPeer && onPeer(r); };
  all.forEach((list) => openOn(list, game, id, { name }).then((r) => {
    if (st.closed || st.won) { try { r.close(); } catch (_) {} return; }
    rooms.push(r); st.ok++;
    if (r.peer) win(r); else r.on("peer", () => win(r));
  }).catch(() => { st.fail++; }));
  st.close = () => { st.closed = true; for (const o of rooms) { try { o.close(); } catch (_) {} } };
  return st;
}
