// Offline cache: the app shell and its art; a new version replaces the old cache.
const VERSION = "derbyo-pwa-61";

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(["./", "index.html", "app.css", "manifest.webmanifest", "vendor/preact-htm.js",
    "js/app.js", "js/data.js", "js/model.js", "js/sound.js", "js/install.js", "js/push.js", "js/update.js", "js/invites.js", "js/ui/common.js", "js/ui/match.js", "js/ui/sheets.js", "js/ui/profile.js", "js/ui/lobby.js", "js/ui/tabbar.js", "js/touch.js", "js/net.js", "js/online.js", "js/ui/live.js", "js/ui/daily.js", "js/ui/games.js", "js/ui/account.js"])));
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

// Pushes from the server: a friend's call or request. A tap opens the app there (an open app is told and brought forward).
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data?.json() ?? {}; } catch {}
  const url = new URL(d.invite ? `./#invite=${d.invite}` : d.open === "friends" ? "./#friends" : "./", self.registration.scope).href;
  e.waitUntil(self.registration.showNotification(d.title || "DERBYO", { body: d.body || "", icon: "icons/icon-192.png", tag: d.invite || d.kind || "derbyo", data: { url } }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = e.notification.data?.url || self.registration.scope;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    const c = list[0];
    if (c) { c.postMessage({ open: url }); return c.focus(); }
    return self.clients.openWindow(url);
  }));
});
