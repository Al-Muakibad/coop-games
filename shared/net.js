/* Онлайн-комнаты «Кооп-игры».
   1) Встреча через публичный MQTT-брокер (WebSocket) — сервер не нужен.
   2) Как только оба телефона нашли друг друга, пытаемся открыть прямой канал телефон↔телефон (WebRTC DataChannel):
      задержка падает с 150–500 мс до 20–80 мс и не зависит от загрузки брокера. Не получилось — продолжаем через брокер.
   Каждое сообщение несёт номер, поэтому дубли (пришло и напрямую, и через брокер) отбрасываются.
   API 1 на 1:  const room = await Net.open(game, roomId|null, {name})
     room.id, room.isHost, room.me, room.peer, room.rtt (мс), room.link ("p2p" | "relay")
     room.on(type, fn(data, from)), room.off(type), room.send(type, data), room.close()
     события: "peer", "peer-left", "full", "status", "link"
   API компании: Net.openParty(game, roomId|null, {name, max}) — см. ниже. */
(function () {
  "use strict";
  const DEF_BROKERS = ["wss://broker.emqx.io:8084/mqtt", "wss://broker.hivemq.com:8884/mqtt", "wss://test.mosquitto.org:8081/mqtt"];
  const ICE = [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }, { urls: "stun:stun.cloudflare.com:3478" },
    // бесплатный публичный TURN — помогает, когда оба телефона за «строгим» NAT мобильного оператора
    { urls: ["turn:openrelay.metered.ca:80", "turn:openrelay.metered.ca:443", "turns:openrelay.metered.ca:443?transport=tcp"], username: "openrelayproject", credential: "openrelayproject" }];
  const rid = (n) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => "abcdefghijkmnpqrstuvwxyz23456789"[b % 32]).join("");

  function connect(url, prefix) {
    return new Promise((resolve, reject) => {
      const c = mqtt.connect(url, { clientId: prefix + rid(10), clean: true, connectTimeout: 7000, reconnectPeriod: 2500, keepalive: 30 });
      const fail = setTimeout(() => { try { c.end(true); } catch (_) {} reject(new Error("timeout " + url)); }, 8000);
      c.once("connect", () => { clearTimeout(fail); resolve(c); });
      c.once("error", (e) => { clearTimeout(fail); try { c.end(true); } catch (_) {} reject(e); });
    });
  }
  async function anyBroker(prefix) {
    let err = null;
    for (const url of (window.NET_BROKERS || DEF_BROKERS)) { try { return await connect(url, prefix); } catch (e) { err = e; } }
    throw err || new Error("no broker");
  }

  // ---------- прямой канал WebRTC ----------
  // signal(d) — отправить сигнал второй стороне; onMsg(text); onState(open:boolean)
  function P2P(signal, offerer, onMsg, onState) {
    const self = { open: false, closed: false };
    if (window.NET_NO_P2P || typeof RTCPeerConnection === "undefined") { self.signal = () => {}; self.send = () => false; self.close = () => {}; return self; }
    let pc, dc = null, pending = [];
    try { pc = new RTCPeerConnection({ iceServers: ICE }); } catch (_) { self.signal = () => {}; self.send = () => false; self.close = () => {}; return self; }
    const setup = (ch) => {
      dc = ch;
      ch.onopen = () => { self.open = true; onState(true); };
      ch.onclose = () => { if (self.open) { self.open = false; onState(false); } };
      ch.onerror = () => {};
      ch.onmessage = (e) => onMsg(e.data);
    };
    pc.onicecandidate = (e) => { if (e.candidate) signal({ c: e.candidate.toJSON ? e.candidate.toJSON() : e.candidate }); };
    pc.onconnectionstatechange = () => { if (["failed", "closed"].includes(pc.connectionState) && self.open) { self.open = false; onState(false); } };
    if (offerer) {
      setup(pc.createDataChannel("g", { ordered: true }));
      pc.createOffer().then((o) => pc.setLocalDescription(o)).then(() => signal({ sdp: pc.localDescription.toJSON ? pc.localDescription.toJSON() : pc.localDescription })).catch(() => {});
    } else pc.ondatachannel = (e) => setup(e.channel);
    self.signal = async (d) => {
      try {
        if (d.sdp) {
          await pc.setRemoteDescription(d.sdp);
          if (d.sdp.type === "offer") { const a = await pc.createAnswer(); await pc.setLocalDescription(a); signal({ sdp: pc.localDescription.toJSON ? pc.localDescription.toJSON() : pc.localDescription }); }
          for (const c of pending) await pc.addIceCandidate(c).catch(() => {});
          pending = [];
        } else if (d.c) {
          if (pc.remoteDescription) await pc.addIceCandidate(d.c).catch(() => {}); else pending.push(d.c);
        }
      } catch (_) {}
    };
    self.send = (text) => { if (!self.open || !dc || dc.readyState !== "open") return false; try { dc.send(text); return true; } catch (_) { return false; } };
    self.close = () => { self.closed = true; self.open = false; try { dc && dc.close(); } catch (_) {} try { pc.close(); } catch (_) {} };
    setTimeout(() => { if (!self.open && !self.closed) self.close(); }, 15000);   // не смогли — остаёмся на брокере
    return self;
  }
  // отсев дублей: помним последние номера от каждого отправителя
  function Dedupe() {
    const seen = {};
    return (f, i) => {
      if (i == null) return false;
      const s = seen[f] || (seen[f] = { set: new Set(), q: [] });
      if (s.set.has(i)) return true;
      s.set.add(i); s.q.push(i); if (s.q.length > 400) s.set.delete(s.q.shift());
      return false;
    };
  }

  // ---------- 1 на 1 ----------
  async function open(game, roomId, opts) {
    opts = opts || {};
    const client = await anyBroker("kg_");
    const isHost = !roomId, id = roomId || rid(6), topic = `coopgames-kg7x/v1/${game}/${id}`;
    const me = { id: "p_" + rid(8), name: (opts.name || "Игрок").slice(0, 20) };
    const handlers = {}, dup = Dedupe();
    let peer = null, peerSeen = 0, closed = false, seq = 0, p2p = null, rtt = 0, hbN = 0;
    const emit = (type, data, from) => (handlers[type] || []).forEach((fn) => { try { fn(data, from); } catch (e) { console.error(e); } });
    const pack = (type, data) => JSON.stringify({ f: me.id, n: me.name, h: isHost ? 1 : 0, t: type, d: data === undefined ? null : data, i: ++seq });
    const relay = (s) => client.publish(topic, s, { qos: 0 });
    const send = (type, data) => {
      if (closed) return;
      const s = pack(type, data);
      if (!(p2p && p2p.send(s))) relay(s);
    };
    const startP2P = () => {
      if (p2p) p2p.close();
      p2p = P2P((d) => relay(pack("rtc", d)), isHost, (text) => handle(text), (on) => { emit("link", on ? "p2p" : "relay"); window.Stats && Stats.event("net_link", { game, link: on ? "p2p" : "relay" }); });
    };
    function handle(buf) {
      let m; try { m = JSON.parse(typeof buf === "string" ? buf : buf.toString()); } catch (_) { return; }
      if (!m || m.f === me.id) return;
      if (peer && m.f !== peer.id) { if (m.t === "hi") relay(pack("full", { to: m.f })); return; }
      if (m.t === "full") { if (m.d && m.d.to === me.id) emit("full"); return; }
      if (!peer && (m.t === "hi" || m.t === "ping")) {
        if (!isHost && !m.h) return;              // гость ждёт именно хозяина комнаты
        peer = { id: m.f, name: m.n || "Друг", host: !!m.h };
        peerSeen = Date.now();
        relay(pack("hi"));
        emit("peer", peer);
        if (isHost) startP2P();
        return;
      }
      if (!peer) return;
      if (dup(m.f, m.i)) return;
      peerSeen = Date.now();
      if (m.t === "rtc") { if (!p2p && !isHost) startP2P(); if (m.d && m.d.sdp && m.d.sdp.type === "offer" && p2p && !isHost && p2p.used) startP2P(); if (p2p) { p2p.used = true; p2p.signal(m.d); } return; }
      if (m.t === "ping") { if (m.d && m.d.ts) send("pong", { ts: m.d.ts }); return; }
      if (m.t === "pong") { if (m.d && m.d.ts) rtt = Math.round(rtt ? rtt * 0.7 + (Date.now() - m.d.ts) * 0.3 : Date.now() - m.d.ts); return; }
      if (m.t === "hi") return;
      if (m.t === "bye") { const p = peer; peer = null; if (p2p) { p2p.close(); p2p = null; } emit("peer-left", p); return; }
      emit(m.t, m.d, m.f);
    }
    client.on("message", (_t, buf) => handle(buf));
    client.on("reconnect", () => emit("status", "reconnect"));
    client.on("connect", () => { emit("status", "online"); client.subscribe(topic); relay(pack("hi")); });
    await new Promise((res) => client.subscribe(topic, { qos: 0 }, res));
    relay(pack("hi"));
    const hb = setInterval(() => {
      if (peer) send("ping", { ts: Date.now() }); else relay(pack("ping"));
      if (peer && ++hbN % 15 === 0 && window.Stats) Stats.event("net_rtt", { game, rtt, link: p2p && p2p.open ? "p2p" : "relay" });
      if (peer && Date.now() - peerSeen > 12000) { const p = peer; peer = null; if (p2p) { p2p.close(); p2p = null; } emit("peer-left", p); }
    }, 2000);
    const room = {
      id, isHost, me, get peer() { return peer; }, topic, get rtt() { return rtt; }, get link() { return p2p && p2p.open ? "p2p" : "relay"; },
      on(type, fn) { (handlers[type] = handlers[type] || []).push(fn); return room; },
      off(type) { delete handlers[type]; },
      send,
      close() { if (closed) return; send("bye"); closed = true; clearInterval(hb); setTimeout(() => { try { p2p && p2p.close(); } catch (_) {} try { client.end(true); } catch (_) {} }, 200); }
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

  /* ---------- Комнаты на несколько игроков (до 8): хозяин ведёт список участников ----------
     const room = await Net.openParty(game, roomId|null, {name, max})
     room.players — [{id, name, host}] в порядке входа; room.me; room.isHost
     события: "roster", "left", "host-left", "full", "link", любые игровые типы
     room.send(type, data) — всем; room.lock() — хозяин закрывает вход (игра началась)
     Прямые каналы: хозяин ↔ каждый гость. Сообщения гостя хозяин пересылает остальным. */
  async function openParty(game, roomId, opts) {
    opts = opts || {};
    const client = await anyBroker("kgp_");
    const isHost = !roomId, id = roomId || rid(6), topic = `coopgames-kg7x/v1p/${game}/${id}`, max = opts.max || 6;
    const me = { id: "p_" + rid(8), name: (opts.name || "Игрок").slice(0, 20), host: isHost };
    const handlers = {}, seen = {}, links = {}, dup = Dedupe();
    let players = isHost ? [me] : [], locked = false, closed = false, hostSeen = Date.now(), hostId = null, seq = 0, rtt = 0;
    const emit = (t, d, f) => (handlers[t] || []).forEach((fn) => { try { fn(d, f); } catch (e) { console.error(e); } });
    const pack = (t, d, extra) => JSON.stringify(Object.assign({ f: me.id, n: me.name, h: isHost ? 1 : 0, t, d: d === undefined ? null : d, i: ++seq }, extra || {}));
    const relay = (s) => { if (!closed) client.publish(topic, s); };
    // хозяин: каждому гостю — напрямую, если канал открыт; кому нет — одна публикация через брокер
    const fanout = (s, except) => {
      let needRelay = false;
      for (const p of players) { if (p.id === me.id || p.id === except) continue; const l = links[p.id]; if (!(l && l.send(s))) needRelay = true; }
      if (needRelay) relay(s);
    };
    const send = (t, d) => {
      if (closed) return;
      const s = pack(t, d);
      if (isHost) fanout(s);
      else { const l = hostId && links[hostId]; if (!(l && l.send(s))) relay(s); }
    };
    const roster = () => { send("roster", players); emit("roster", players); };
    const startLink = (peerId, offerer) => {
      if (links[peerId]) links[peerId].close();
      links[peerId] = P2P((d) => relay(pack("rtc", d, { to: peerId })), offerer, (text) => handle(text, peerId), (on) => { emit("link", { id: peerId, on }); window.Stats && Stats.event("net_link", { game, link: on ? "p2p" : "relay", party: 1 }); });
    };
    function handle(buf, viaLink) {
      let m; try { m = JSON.parse(typeof buf === "string" ? buf : buf.toString()); } catch (_) { return; }
      if (!m || m.f === me.id) return;
      if (m.to && m.to !== me.id) return;
      if (dup(m.f, m.i)) return;
      seen[m.f] = Date.now();
      if (m.t === "rtc") { if (!links[m.f] && !isHost) startLink(m.f, false); if (links[m.f]) links[m.f].signal(m.d); return; }
      if (m.t === "ping" && m.d && m.d.ts && m.to === me.id) { send("pong", { ts: m.d.ts, to: m.f }); return; }
      if (m.t === "pong") { if (m.d && m.d.to === me.id && m.d.ts) rtt = Math.round(rtt ? rtt * 0.7 + (Date.now() - m.d.ts) * 0.3 : Date.now() - m.d.ts); return; }
      if (isHost) {
        if (m.t === "hi" || m.t === "ping") {
          if (!players.some((p) => p.id === m.f)) {
            if (locked || players.length >= max) { relay(pack("full", { to: m.f, started: locked })); return; }
            players.push({ id: m.f, name: m.n || "Игрок", host: false }); roster();
            startLink(m.f, true);
          } else if (m.t === "hi") send("roster", players);
          return;
        }
        if (m.t === "bye") { players = players.filter((p) => p.id !== m.f); if (links[m.f]) { links[m.f].close(); delete links[m.f]; } roster(); emit("left", m.f); return; }
        if (!players.some((p) => p.id === m.f)) return;
        if (viaLink && m.t !== "pong") fanout(typeof buf === "string" ? buf : buf.toString(), m.f);   // пересылаем остальным гостям
      } else {
        if (m.h) { hostSeen = Date.now(); hostId = m.f; }
        if (m.t === "roster" && m.h) { players = m.d || []; emit("roster", players); return; }
        if (m.t === "full") { if (m.d && m.d.to === me.id) emit("full", m.d); return; }
        if (m.t === "hi" || m.t === "ping") return;
        if (m.t === "bye" && m.h) { emit("host-left"); return; }
      }
      emit(m.t, m.d, m.f);
    }
    client.on("message", (_t, buf) => handle(buf, null));
    client.on("connect", () => { client.subscribe(topic); relay(pack("hi")); });
    await new Promise((res) => client.subscribe(topic, { qos: 0 }, res));
    relay(pack("hi"));
    const hb = setInterval(() => {
      if (isHost) {
        relay(pack("ping"));
        const now = Date.now();
        const gone = players.filter((p) => p.id !== me.id && now - (seen[p.id] || now) > 12000);
        if (gone.length) { players = players.filter((p) => !gone.includes(p)); gone.forEach((g) => { if (links[g.id]) { links[g.id].close(); delete links[g.id]; } }); roster(); gone.forEach((g) => emit("left", g.id)); }
      } else {
        const l = hostId && links[hostId];
        if (l && l.open) l.send(pack("ping", { ts: Date.now() }, { to: hostId })); else relay(pack("ping", hostId ? { ts: Date.now() } : null, hostId ? { to: hostId } : {}));
        const now = Date.now();
        if (now - hostSeen > 12000 && players.length) { hostSeen = now + 1e9; emit("host-left"); }
      }
    }, 2000);
    const room = {
      id, isHost, me, get players() { return players; }, topic, get rtt() { return rtt; },
      get link() { return isHost ? (Object.values(links).some((l) => l.open) ? "p2p" : "relay") : (hostId && links[hostId] && links[hostId].open ? "p2p" : "relay"); },
      on(t, fn) { (handlers[t] = handlers[t] || []).push(fn); return room; },
      off(t) { delete handlers[t]; },
      send, lock() { locked = true; }, unlock() { locked = false; },
      close() { if (closed) return; send("bye"); relay(pack("bye")); closed = true; clearInterval(hb); setTimeout(() => { Object.values(links).forEach((l) => l.close()); try { client.end(true); } catch (_) {} }, 200); }
    };
    if (isHost) setTimeout(() => emit("roster", players), 0);
    window.addEventListener("pagehide", () => room.close());
    return room;
  }

  window.Net = { open, openParty, inviteLink, readInvite };
})();
