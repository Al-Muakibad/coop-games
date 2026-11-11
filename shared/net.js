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
  const ICE0 = [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }, { urls: "stun:stun.cloudflare.com:3478" },
    // бесплатный публичный TURN — помогает, когда оба телефона за «строгим» NAT мобильного оператора
    { urls: ["turn:openrelay.metered.ca:80", "turn:openrelay.metered.ca:443", "turns:openrelay.metered.ca:443?transport=tcp"], username: "openrelayproject", credential: "openrelayproject" }];
  let ICE = window.NET_ICE || ICE0;   // свой TURN (например, Cloudflare) можно подставить через window.NET_ICE
  // Open Relay больше не принимает старый общий логин; работает «статическая» авторизация по общему секрету (как в coturn use-auth-secret):
  // логин = срок годности (unix-время), пароль = base64(HMAC-SHA1(секрет, логин)). Считаем заранее — к моменту первого канала будет готово.
  if (!window.NET_ICE && window.crypto && crypto.subtle) (async () => {
    try {
      const user = String(Math.floor(Date.now() / 1000) + 24 * 3600), enc = new TextEncoder();
      const key = await crypto.subtle.importKey("raw", enc.encode("openrelayprojectsecret"), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
      const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(user)));
      const cred = btoa(String.fromCharCode.apply(null, sig)), H = "staticauth.openrelay.metered.ca";
      ICE = [ICE0[0], ICE0[1], { urls: [`turn:${H}:80`, `turn:${H}:80?transport=tcp`, `turn:${H}:443`, `turns:${H}:443?transport=tcp`], username: user, credential: cred }, ICE0[2]];
    } catch (_) {}
  })();
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
  function P2P(signal, offerer, onMsg, onState, wait) {
    const self = { open: false, closed: false };
    if (window.NET_NO_P2P || typeof RTCPeerConnection === "undefined") { self.signal = () => {}; self.send = self.sendFast = () => false; self.close = () => {}; return self; }
    let pc, dc = null, pending = [];
    try { pc = new RTCPeerConnection({ iceServers: ICE }); } catch (_) { self.signal = () => {}; self.send = self.sendFast = () => false; self.close = () => {}; return self; }
    let fc = null;   // быстрый канал: без очереди и переотправки — для частых снимков состояния
    const setupFast = (ch) => { fc = ch; ch.onmessage = (e) => onMsg(e.data); ch.onerror = () => {}; };
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
      try { setupFast(pc.createDataChannel("u", { ordered: false, maxRetransmits: 0 })); } catch (_) {}
      pc.createOffer().then((o) => pc.setLocalDescription(o)).then(() => signal({ sdp: pc.localDescription.toJSON ? pc.localDescription.toJSON() : pc.localDescription })).catch(() => {});
    } else pc.ondatachannel = (e) => (e.channel.label === "u" ? setupFast(e.channel) : setup(e.channel));
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
    self.sendFast = (text) => { if (fc && fc.readyState === "open") { try { fc.send(text); return true; } catch (_) {} } return self.send(text); };
    self.close = () => { self.closed = true; self.open = false; try { fc && fc.close(); } catch (_) {} try { dc && dc.close(); } catch (_) {} try { pc.close(); } catch (_) {} };
    setTimeout(() => { if (!self.open && !self.closed) self.close(); }, wait || 15000);   // не смогли — пока остаёмся на брокере (хозяин попробует ещё)
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
    const isHost = !roomId || !!opts.host, id = roomId || rid(6), topic = `coopgames-kg7x/v1/${game}/${id}`;
    // opts.host — хозяин возвращается в свою же комнату (по старой ссылке); без него поведение прежнее
    const me = { id: "p_" + rid(8), name: (opts.name || "Игрок").slice(0, 20) };
    const handlers = {}, dup = Dedupe();
    let peer = null, peerSeen = 0, closed = false, seq = 0, p2p = null, rtt = 0, hbN = 0;
    // живость прямого канала: когда последний раз что-то пришло именно по нему. Канал может «умереть» молча
    // (смена сети, телефон уснул): readyState остаётся "open", а данные уходят в пустоту — тогда шлём ещё и через брокер.
    let p2pIn = 0, p2pTry = 0, hbLast = Date.now(), peerAt = 0;
    const p2pStale = () => p2p && p2p.open && Date.now() - p2pIn > 3500;
    const emit = (type, data, from) => (handlers[type] || []).forEach((fn) => { try { fn(data, from); } catch (e) { console.error(e); } });
    const pack = (type, data) => JSON.stringify({ f: me.id, n: me.name, h: isHost ? 1 : 0, t: type, d: data === undefined ? null : data, i: ++seq });
    const relay = (s) => client.publish(topic, s, { qos: 0 });
    const send = (type, data, fast) => {
      if (closed) return;
      const s = pack(type, data);
      const ok = p2p && (fast ? p2p.sendFast(s) : p2p.send(s));
      if (!ok || p2pStale()) relay(s);     // дубль отсеется на той стороне
    };
    const startP2P = () => {
      if (p2p) p2p.close();
      p2pTry = Date.now();
      p2p = P2P((d) => relay(pack("rtc", d)), isHost, (text) => { p2pIn = Date.now(); handle(text); }, (on) => { if (on) p2pIn = Date.now(); emit("link", on ? "p2p" : "relay"); window.Stats && Stats.event("net_link", { game, link: on ? "p2p" : "relay" }); });
    };
    function handle(buf) {
      let m; try { m = JSON.parse(typeof buf === "string" ? buf : buf.toString()); } catch (_) { return; }
      if (!m || m.f === me.id) return;
      if (peer && m.f !== peer.id) { if (m.t === "hi") relay(pack("full", { to: m.f })); return; }
      if (m.t === "full") { if (m.d && m.d.to === me.id) emit("full"); return; }
      if (!peer && (m.t === "hi" || m.t === "ping")) {
        if (!isHost && !m.h) return;              // гость ждёт именно хозяина комнаты
        peer = { id: m.f, name: m.n || "Друг", host: !!m.h };
        peerSeen = peerAt = Date.now();
        relay(pack("hi"));
        emit("peer", peer);
        if (isHost) startP2P();
        return;
      }
      if (!peer) return;
      if (dup(m.f, m.i)) return;
      peerSeen = Date.now();
      if (m.t === "rtc") { if ((!p2p || p2p.closed) && !isHost) startP2P(); if (m.d && m.d.sdp && m.d.sdp.type === "offer" && p2p && !isHost && p2p.used) startP2P(); if (p2p) { p2p.used = true; p2p.signal(m.d); } return; }
      if (m.t === "ping") {
        if (m.d && m.d.ts) { send("pong", { ts: m.d.ts }); return; }
        if (Date.now() - peerAt < 4000) return;     // пинг, отправленный до рукопожатия
        // пинг без метки шлёт только тот, кто нас «потерял» (у него нет напарника). Мы же его видим —
        // значит, связь рвалась в одну сторону: прямой канал бросаем, здороваемся заново через брокер.
        if (p2p) { p2p.close(); p2p = null; emit("link", "relay"); }
        relay(pack("hi")); emit("resync", peer);
        return;
      }
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
    // вкладка спала (экран погас, Telegram свернули): таймеры стояли, сообщения ещё не разобраны — не считаем это уходом напарника
    const woke = () => { const now = Date.now(); if (now - hbLast > 5000 && peer) peerSeen = Math.max(peerSeen, now - 4000); hbLast = now; };
    const onVis = () => { if (document.visibilityState === "visible" && !closed) { woke(); if (peer) send("ping", { ts: Date.now() }); else relay(pack("ping")); } };
    document.addEventListener("visibilitychange", onVis);
    const hb = setInterval(() => {
      woke();
      if (peer) send("ping", { ts: Date.now() }); else relay(pack("ping"));
      // прямой канал молчит дольше 8 с, хотя открыт, — закрываем; хозяин потом попробует открыть новый
      if (p2p && p2p.open && Date.now() - p2pIn > 8000) { p2p.close(); p2p = null; emit("link", "relay"); }
      if (peer && isHost && (!p2p || p2p.closed) && Date.now() - p2pTry > 30000 && Date.now() - peerSeen < 4000) startP2P();
      if (peer && ++hbN % 15 === 0 && window.Stats) Stats.event("net_rtt", { game, rtt, link: p2p && p2p.open ? "p2p" : "relay" });
      if (peer && Date.now() - peerSeen > 12000) { const p = peer; peer = null; if (p2p) { p2p.close(); p2p = null; } emit("peer-left", p); }
    }, 2000);
    const room = {
      id, isHost, me, get peer() { return peer; }, topic, get rtt() { return rtt; }, get link() { return p2p && p2p.open ? "p2p" : "relay"; },
      on(type, fn) { (handlers[type] = handlers[type] || []).push(fn); return room; },
      off(type) { delete handlers[type]; },
      send, sendFast: (type, data) => send(type, data, true),
      close() { if (closed) return; send("bye"); closed = true; clearInterval(hb); document.removeEventListener("visibilitychange", onVis); setTimeout(() => { try { p2p && p2p.close(); } catch (_) {} try { client.end(true); } catch (_) {} }, 200); }
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
    let lastTick = Date.now(), probe = null, hiddenAt = 0;
    const emit = (t, d, f) => (handlers[t] || []).forEach((fn) => { try { fn(d, f); } catch (e) { console.error(e); } });
    const pack = (t, d, extra) => JSON.stringify(Object.assign({ f: me.id, n: me.name, h: isHost ? 1 : 0, t, d: d === undefined ? null : d, i: ++seq }, extra || {}));
    const stat = { rx: 0, rxBytes: 0, rxP2p: 0, rxRelay: 0, tx: 0, txRelay: 0, simLost: 0, linkTries: 0 };
    const relay = (s) => { if (!closed) { stat.txRelay++; client.publish(topic, s); } };
    // хозяин: каждому гостю — напрямую, если канал открыт; кому нет — одна публикация через брокер
    const fanout = (s, except, fast) => {
      let needRelay = false;
      for (const p of players) { if (p.id === me.id || p.id === except) continue; const l = links[p.id]; if (!(l && (fast ? l.sendFast(s) : l.send(s)))) needRelay = true; }
      if (needRelay) relay(s);
    };
    const send = (t, d, fast) => {
      if (closed) return;
      const s = pack(t, d, fast ? { u: 1 } : null); stat.tx++;
      if (isHost) fanout(s, null, fast);
      else { const l = hostId && links[hostId]; if (!(l && (fast ? l.sendFast(s) : l.send(s)))) relay(s); }
    };
    const roster = () => { send("roster", players); emit("roster", players); };
    const linkTry = {};
    const startLink = (peerId, offerer) => {
      if (links[peerId]) links[peerId].close();
      if (offerer) { const lt = linkTry[peerId] || (linkTry[peerId] = { n: 0, at: 0 }); lt.n++; lt.at = Date.now(); stat.linkTries++; }
      links[peerId] = P2P((d) => relay(pack("rtc", d, { to: peerId })), offerer, (text) => handle(text, peerId), (on) => { emit("link", { id: peerId, on }); window.Stats && Stats.event("net_link", { game, link: on ? "p2p" : "relay", party: 1 }); }, opts.p2pRetry ? 25000 : 15000);
    };
    // плохая сеть для автотестов: window.NET_SIM = { lat, jit, loss } (мс в одну сторону, доля потерь «быстрых» сообщений)
    let simLast = 0;
    function handle(buf, viaLink) {
      const SIM = window.NET_SIM;
      if (SIM && !buf.__sim) {
        const str = typeof buf === "string" ? buf : buf.toString(), fast = str.indexOf('"u":1') >= 0;
        if (fast && Math.random() < (SIM.loss || 0)) { stat.simLost++; return; }
        let at = Date.now() + (SIM.lat || 0) + (Math.random() * 2 - 1) * (SIM.jit || 0);
        if (!viaLink || !fast) { if (SIM.stall && Math.random() < SIM.stall) at += 300 + Math.random() * 600; at = Math.max(at, simLast); simLast = at; }   // stall: брокер иногда «залипает» и отдаёт пачкой   // брокер и надёжный канал — порядок сохраняется, задержки копятся пачками
        const o = new String(str); o.__sim = 1; setTimeout(() => handle(o, viaLink), Math.max(0, at - Date.now())); return;
      }
      stat.rx++; stat.rxBytes += buf.length || 0; if (viaLink) stat.rxP2p++; else stat.rxRelay++;
      let m; try { m = JSON.parse(typeof buf === "string" ? buf : buf.toString()); } catch (_) { return; }
      if (m && m.f === me.id && m.t === "probe") { if (probe && m.d === probe.id) { probe = null; emit("net-ok"); } return; }   // эхо своей пробы: брокер жив
      if (!m || m.f === me.id) return;
      if (m.to && m.to !== me.id) return;
      if (dup(m.f, m.i)) return;
      seen[m.f] = Date.now();
      if (m.t === "rtc") {
        // новое предложение от хозяина (например, после возвращения из фона) — старый канал выбрасываем
        if (!isHost && m.d && m.d.sdp && m.d.sdp.type === "offer" && links[m.f]) { links[m.f].close(); delete links[m.f]; }
        if (!links[m.f] && !isHost) startLink(m.f, false); if (links[m.f]) links[m.f].signal(m.d); return;
      }
      if (m.t === "ping" && m.d && m.d.ts && m.to === me.id) { send("pong", { ts: m.d.ts, to: m.f }); return; }
      if (m.t === "pong") { if (m.d && m.d.to === me.id && m.d.ts) rtt = Math.round(rtt ? rtt * 0.7 + (Date.now() - m.d.ts) * 0.3 : Date.now() - m.d.ts); return; }
      if (isHost) {
        if (m.t === "hi" || m.t === "ping") {
          if (!players.some((p) => p.id === m.f)) {
            if ((locked && !opts.late) || players.length >= max) { relay(pack("full", { to: m.f, started: locked })); return; }
            players.push({ id: m.f, name: m.n || "Игрок", host: false }); roster();
            startLink(m.f, true);
            if (locked) emit("join-late", m.f);   // opts.late: вход в уже идущую игру (Аванпост)
          } else if (m.t === "hi") { send("roster", players); if (!(links[m.f] && links[m.f].open)) startLink(m.f, true); }   // вернулся из фона — заново прямой канал
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
        if (m.t === "bye" && m.h) { if (links[m.f]) { links[m.f].close(); delete links[m.f]; } emit("host-left"); return; }
      }
      emit(m.t, m.d, m.f);
    }
    client.on("message", (_t, buf) => handle(buf, null));
    client.on("connect", () => { client.subscribe(topic, { qos: 0 }, () => { relay(pack("hi")); if (probe) { probe = { id: rid(6), t: Date.now() }; relay(pack("probe", probe.id)); } if (isHost) roster(); emit("net-up"); }); });
    await new Promise((res) => client.subscribe(topic, { qos: 0 }, res));
    relay(pack("hi"));
    // Возвращение из фона (Telegram свернули, телефон уснул): таймеры стояли, сокеты могли умереть.
    // Не считаем никого ушедшим по «старым» часам, проверяем брокер эхом, пересоздаём прямые каналы, заново представляемся.
    const revive = (why) => {
      if (closed) return;
      const now = Date.now(); lastTick = now; hostSeen = now; for (const k in seen) seen[k] = now;
      for (const k of Object.keys(links)) { links[k].close(); delete links[k]; }
      const pid = rid(6); probe = { id: pid, t: now };
      relay(pack("probe", pid));
      setTimeout(() => { if (!closed && probe && probe.id === pid) { try { client.reconnect(); } catch (_) {} } }, 2500);   // эха нет — сокет мёртв, переподключаемся
      relay(pack("hi"));
      if (isHost) { roster(); players.forEach((p) => { if (p.id !== me.id) startLink(p.id, true); }); }
      emit("revive", why);
    };
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt > 1500) { hiddenAt = 0; revive("visible"); }
    });
    window.addEventListener("pageshow", (e) => { if (e.persisted) revive("pageshow"); });
    const hb = setInterval(() => {
      if (closed) return;
      if (Date.now() - lastTick > 6000) { revive("freeze"); return; }   // таймер «проспал» — страница была заморожена
      lastTick = Date.now();
      if (isHost) {
        relay(pack("ping"));
        const now = Date.now();
        // прямой канал не открылся (мобильный NAT, медленный ICE) — пробуем снова: через 20, 40, 80 с… (до 6 попыток)
        if (opts.p2pRetry) for (const p of players) { if (p.id === me.id) continue; const l = links[p.id], lt = linkTry[p.id]; if (l && (l.open || !l.closed)) continue; if (!lt) { startLink(p.id, true); continue; } if (lt.n < 6 && now - lt.at > 20000 * Math.pow(2, lt.n - 1)) startLink(p.id, true); }
        const gone = players.filter((p) => p.id !== me.id && now - (seen[p.id] || now) > 12000);
        if (gone.length) { players = players.filter((p) => !gone.includes(p)); gone.forEach((g) => { if (links[g.id]) { links[g.id].close(); delete links[g.id]; } }); roster(); gone.forEach((g) => emit("left", g.id)); }
      } else {
        const l = hostId && links[hostId];
        if (l && l.open) l.send(pack("ping", { ts: Date.now() }, { to: hostId })); else relay(pack("ping", hostId ? { ts: Date.now() } : null, hostId ? { to: hostId } : {}));
        const now = Date.now();
        if (now - hostSeen > 12000 && players.length) { hostSeen = now + 1e9; if (hostId && links[hostId]) { links[hostId].close(); delete links[hostId]; } emit("host-left"); }
      }
    }, 2000);
    const room = {
      id, isHost, me, get players() { return players; }, topic, get rtt() { return rtt; }, stat,
      get links() { return Object.fromEntries(Object.entries(links).map(([k, l]) => [k, l.open ? "p2p" : l.closed ? "fail" : "ice"])); },
      get link() { return isHost ? (Object.values(links).some((l) => l.open) ? "p2p" : "relay") : (hostId && links[hostId] && links[hostId].open ? "p2p" : "relay"); },
      on(t, fn) { (handlers[t] = handlers[t] || []).push(fn); return room; },
      off(t) { delete handlers[t]; },
      send, sendFast: (t, d) => send(t, d, true), lock() { locked = true; }, unlock() { locked = false; },
      close() { if (closed) return; send("bye"); relay(pack("bye")); closed = true; clearInterval(hb); setTimeout(() => { Object.values(links).forEach((l) => l.close()); try { client.end(true); } catch (_) {} }, 200); }
    };
    room.revive = revive;
    room.alive = () => !!client.connected && !probe;
    if (isHost) setTimeout(() => emit("roster", players), 0);
    window.addEventListener("pagehide", (e) => { if (!e.persisted) room.close(); });   // свёрнутую в кэш страницу не закрываем
    return room;
  }

  window.Net = { open, openParty, inviteLink, readInvite };
})();
