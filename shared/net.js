/* Онлайн-комнаты для игр «Кооп-игры» поверх публичного MQTT-брокера (WebSocket).
   Сервер не нужен: два телефона подписываются на одну тему и обмениваются сообщениями.
   API:
     const room = await Net.open(game, roomId|null, {name})   // null = создать новую комнату
     room.id, room.isHost, room.me, room.peer ({id,name}|null)
     room.on(type, fn(data, from))   room.send(type, data)   room.close()
   Системные события: "peer" (друг подключился), "peer-left" (друг пропал), "status" (строка состояния). */
(function () {
  "use strict";
  const BROKERS = window.NET_BROKERS || [
    "wss://broker.emqx.io:8084/mqtt",
    "wss://broker.hivemq.com:8884/mqtt",
    "wss://test.mosquitto.org:8081/mqtt"
  ];
  const PREFIX = "coopgames-kg7x/v1";
  const rid = (n) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => "abcdefghijkmnpqrstuvwxyz23456789"[b % 32]).join("");

  function connect(url) {
    return new Promise((resolve, reject) => {
      const c = mqtt.connect(url, { clientId: "kg_" + rid(10), clean: true, connectTimeout: 7000, reconnectPeriod: 2500, keepalive: 30 });
      const fail = setTimeout(() => { try { c.end(true); } catch (_) {} reject(new Error("timeout " + url)); }, 8000);
      c.once("connect", () => { clearTimeout(fail); resolve(c); });
      c.once("error", (e) => { clearTimeout(fail); try { c.end(true); } catch (_) {} reject(e); });
    });
  }

  async function open(game, roomId, opts) {
    opts = opts || {};
    let client = null, lastErr = null;
    for (const url of BROKERS) {
      try { client = await connect(url); break; } catch (e) { lastErr = e; }
    }
    if (!client) throw lastErr || new Error("no broker");
    const isHost = !roomId;
    const id = roomId || rid(6);
    const topic = `${PREFIX}/${game}/${id}`;
    const me = { id: "p_" + rid(8), name: (opts.name || "Игрок").slice(0, 20) };
    const handlers = {};
    let peer = null, peerSeen = 0, closed = false;
    const emit = (type, data, from) => (handlers[type] || []).forEach((fn) => { try { fn(data, from); } catch (e) { console.error(e); } });
    const send = (type, data) => {
      if (closed) return;
      client.publish(topic, JSON.stringify({ f: me.id, n: me.name, h: isHost ? 1 : 0, t: type, d: data === undefined ? null : data }), { qos: 0 });
    };
    client.on("message", (_t, buf) => {
      let m; try { m = JSON.parse(buf.toString()); } catch (_) { return; }
      if (!m || m.f === me.id) return;
      if (peer && m.f !== peer.id) { if (m.t === "hi") send("full", { to: m.f }); return; }
      if (m.t === "full") { if (m.d && m.d.to === me.id) emit("full"); return; }
      if (!peer && (m.t === "hi" || m.t === "ping")) {
        if (!isHost && !m.h) return;              // гость ждёт именно хозяина комнаты
        peer = { id: m.f, name: m.n || "Друг", host: !!m.h };
        peerSeen = Date.now();
        send("hi");
        emit("peer", peer);
        return;
      }
      peerSeen = Date.now();
      if (m.t === "hi" || m.t === "ping") return;
      if (m.t === "bye") { const p = peer; peer = null; emit("peer-left", p); return; }
      emit(m.t, m.d, m.f);
    });
    client.on("reconnect", () => emit("status", "reconnect"));
    client.on("connect", () => { emit("status", "online"); client.subscribe(topic); send("hi"); });
    await new Promise((res) => client.subscribe(topic, { qos: 0 }, res));
    send("hi");
    const hb = setInterval(() => {
      send("ping");
      if (peer && Date.now() - peerSeen > 12000) { const p = peer; peer = null; emit("peer-left", p); }
    }, 2500);
    const room = {
      id, isHost, me, get peer() { return peer; }, topic,
      on(type, fn) { (handlers[type] = handlers[type] || []).push(fn); return room; },
      off(type) { delete handlers[type]; },
      send,
      close() { if (closed) return; send("bye"); closed = true; clearInterval(hb); setTimeout(() => { try { client.end(true); } catch (_) {} }, 200); }
    };
    window.addEventListener("pagehide", () => room.close());
    return room;
  }

  // Ссылка-приглашение: t.me/бот?startapp=<игра>-r<комната>
  function inviteLink(game, roomId) { return window.TG.gameLink(game, "r" + roomId); }
  function readInvite() {
    const p = new URLSearchParams(location.search).get("c");
    const m = p && /^r([a-z0-9]{6})$/.exec(p);
    return m ? m[1] : null;
  }
  window.Net = { open, inviteLink, readInvite };
})();
