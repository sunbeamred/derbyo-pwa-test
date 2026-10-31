// Offline cache: the app shell and its art; a new version replaces the old cache. The API is never cached.
const VERSION = "derbyo-pwa-117";

const SHELL = ["./", "index.html", "app.css", "manifest.webmanifest", "vendor/preact-htm.js",
  "js/app.js", "js/data.js", "js/model.js", "js/sound.js", "js/install.js", "js/push.js", "js/update.js", "js/invites.js", "js/ui/common.js", "js/ui/match.js", "js/ui/sheets.js", "js/ui/profile.js", "js/ui/lobby.js", "js/ui/tabbar.js", "js/touch.js", "js/net.js", "js/online.js", "js/ui/live.js", "js/ui/daily.js", "js/ui/games.js", "js/ui/account.js"];

// One missing file must not stop the whole install: each is cached on its own.
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => Promise.allSettled(SHELL.map((u) => c.add(u)))));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

const keep = (req, r) => { if (r.ok && r.type === "basic") { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); } return r; };
// The network, but no longer than `ms`: on a slow line the cached copy answers and the fresh one still lands in the cache.
function fresh(req, ms) {
  const net = fetch(req).then((r) => keep(req, r));
  const late = new Promise((ok) => setTimeout(ok, ms)).then(() => caches.match(req, { ignoreSearch: true })).then((r) => r || net);
  return Promise.race([net.catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r ?? caches.match("index.html"))), late]);
}

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  // The server's answers and the match stream are never cached; version.json always asks the server.
  if (url.pathname.startsWith("/api/") || url.pathname.endsWith("/version.json")) return;
  // Pictures carry the build in their address: a cached one is the right one.
  if (/\.(png|jpe?g|webp|svg|wav|woff2?)$/.test(url.pathname)) {
    e.respondWith(caches.match(e.request).then((r) => r ?? fetch(e.request).then((x) => keep(e.request, x))));
    return;
  }
  // The shell and code: fresh from the network when it answers within 2.5 s, else the cached copy.
  e.respondWith(fresh(e.request, 2500));
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
