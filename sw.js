// Offline cache: the app shell and its art; a new version replaces the old cache.
const VERSION = "derbyo-pwa-18";

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(["./", "index.html", "app.css", "manifest.webmanifest", "vendor/preact-htm.js",
    "js/app.js", "js/data.js", "js/model.js", "js/sound.js", "js/install.js", "js/ui/common.js", "js/ui/match.js", "js/ui/sheets.js", "js/ui/profile.js", "js/ui/lobby.js", "js/ui/tabbar.js", "js/touch.js", "js/net.js", "js/online.js", "js/ui/live.js", "js/ui/account.js"])));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

// Network first, so a new deploy shows at once; the cache answers when offline.
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(fetch(e.request).then((r) => {
    if (r.ok) { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); }
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r ?? caches.match("index.html"))));
});
