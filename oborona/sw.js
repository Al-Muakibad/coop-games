/* Кэш «Аванпоста»: тяжёлые файлы (модели, текстуры, музыка, three.js) берём из памяти телефона,
   код игры и страницы — сначала из сети (чтобы обновления приходили сразу), без сети — из кэша. */
const CACHE = "avanpost-v14";
const HEAVY = /\.(glb|webp|hdr|mp3|png|jpg)(\?|$)/i;
const PINNED_CDN = /^https:\/\/cdn\.jsdelivr\.net\/npm\/(three@0\.160\.0|mqtt@5\.10\.1|es-module-shims@1\.10\.0)\//;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== CACHE && k.startsWith("avanpost-")) await caches.delete(k);
  await self.clients.claim();
})()));

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = req.url;
  const sameOrigin = url.startsWith(self.location.origin);
  if (PINNED_CDN.test(url) || (sameOrigin && HEAVY.test(url))) {
    // cache-first: версия зашита в адрес (?v=… или @версия), поэтому файл не устаревает
    e.respondWith(caches.open(CACHE).then(async (c) => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res && (res.ok || res.type === "opaque")) c.put(req, res.clone());
      return res;
    }));
  } else if (sameOrigin && /\/coop-games\//.test(url) && /\.(js|css|html)(\?|$)|\/$/.test(url)) {
    // network-first для кода
    e.respondWith(fetch(req).then((res) => {
      if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req)));
  }
});
