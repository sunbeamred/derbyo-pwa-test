// The site's API (derbyo.online, reached through this host's proxy, so same origin): requests, the account,
// the match stream. The protocol is the site's own client's (public/lab.js); nothing here is invented.
import { store } from "./model.js";

let generation = null;
/** The site's settings: presets, themes, the fleet generation the requests must name. */
export let config = null;

// The server speaks Russian, but its gateway can answer in English (a timeout, a busy server): the player sees Russian.
const russian = (text, status) => {
  if (!text) return status === 0 ? "Нет связи с сервером" : `Ошибка ${status}`;
  if (/[а-яё]/i.test(text)) return text;
  if (/time(d)? ?out/i.test(text)) return "Сервер не ответил вовремя. Попробуй ещё раз.";
  return "Не получилось. Попробуй ещё раз.";
};

export class ApiError extends Error {
  constructor(status, body) { super(russian(body?.error, status)); this.status = status; this.code = body?.code; }
}

const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));
// A slow line must not hang a move: each try gets 9 s. A request that is safe to send twice (a GET, or a POST carrying its
// own idempotency `id`) is tried again after a lost connection, a timeout or a gateway hiccup, twice at most.
const TRY_MS = 9000, RETRY = new Set([0, 408, 502, 503, 504]);

/** One request to the site. POSTs carry JSON; the fleet needs the generation on every request. */
export async function api(path, body, { token, method, tries } = {}) {
  const post = body !== undefined || method === "POST";
  const safe = !post || typeof body?.id === "string";
  const left = tries ?? (safe ? 3 : 1);
  try { return await once(path, body, { token, post }); }
  catch (e) {
    if (left <= 1 || !RETRY.has(e.status)) throw e;
    await wait(e.status === 0 ? 700 : 1200);
    return api(path, body, { token, method, tries: left - 1 });
  }
}

async function once(path, body, { token, post }) {
  const headers = {};
  if (generation) headers["X-Derbyo-Generation"] = generation;
  // The server tells the app from the site (visit statistics, the match intro wait).
  headers["X-Derbyo-Client"] = "app";
  if (token) headers.Authorization = `Bearer ${token}`;
  if (post) headers["Content-Type"] = "application/json";
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), TRY_MS);
  let r;
  try { r = await fetch(path, { method: post ? "POST" : "GET", headers, body: post ? JSON.stringify(body ?? {}) : undefined, cache: "no-store", signal: ctl.signal }); }
  catch { clearTimeout(timer); throw new ApiError(ctl.signal.aborted ? 408 : 0, { error: ctl.signal.aborted ? "Сервер не ответил вовремя. Попробуй ещё раз." : "Нет связи с сервером" }); }
  let data = null;
  try { data = await r.json(); } catch {}
  clearTimeout(timer);
  if (r.status === 429) throw new ApiError(429, { error: data?.error || "Слишком часто. Подожди немного.", code: "RATE" });
  if (!r.ok || data?.ok === false) throw new ApiError(r.status, data);
  return data;
}

export const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join(""));

// MARK: account

/** Who you are on the site: a guest until you register or log in (the cookie lives on this host). */
export const account = {
  profile: null,
  ready: false,
  get registered() { return !!this.profile?.registered; },
  /** The name you play under: the nickname, or a guest name kept on this phone. */
  get name() {
    if (this.profile?.nickname) return this.profile.nickname;
    try { return localStorage.getItem("derbyo-guest-name") || ""; } catch { return ""; }
  },
  set guestName(v) { try { localStorage.setItem("derbyo-guest-name", v); } catch {} store.changed(); },
  async load() {
    // The settings and the account each on their own: a failed /api/config is fetched again in the background, since
    // without its generation the next room request would fail with a misleading «update the page».
    const cfgOnce = () => api("/api/config").then((c) => { config = c; generation = c.generation ?? null; return c; });
    const cfg = cfgOnce().catch(() => { const again = (ms) => setTimeout(() => cfgOnce().catch(() => again(Math.min(ms * 2, 30000))), ms); again(2000); });
    const me = await api("/api/account/me");
    this.profile = me.profile;
    await cfg;
    if (!this.name) this.guestName = "Гость" + Math.floor(1000 + Math.random() * 9000);
    this.ready = true;
    store.changed();
    return this.profile;
  },
  async send(route, body) {
    const r = await api(`/api/account/${route}`, body);
    this.profile = r.profile;
    store.changed();
    return r;
  },
};

export const leaderboard = (period) => api(`/api/leaderboard?period=${period}`);
export const playerProfile = (id) => api(`/api/players/profile?id=${encodeURIComponent(id)}`).then((r) => r.profile);
/** The site's friends: the list and requests, a search by nickname, and request/accept/decline/cancel/remove. */
export const social = {
  state: () => api("/api/social/state"),
  search: (q) => api(`/api/social/search?q=${encodeURIComponent(q)}`).then((r) => r.players),
  friend: (target, action) => api("/api/social/friend", { target, action }),
  // `contexto`: a Контекстно room code to call the friend into, instead of a new tic-tac-toe match.
  invite: (target, contexto) => api("/api/social/invite", contexto ? { target, contexto } : { target }),
  invitation: (id, action) => api("/api/social/invitation", { id, action }),
};
export const openRooms = () => api("/api/rooms").then((r) => r.rooms);
export const siteStats = () => api("/api/stats");

// MARK: sessions

const SESSION_KEY = "derbyo-app-session";
export const savedSession = {
  get() { try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; } },
  set(s) { try { s ? localStorage.setItem(SESSION_KEY, JSON.stringify(s)) : localStorage.removeItem(SESSION_KEY); } catch {} },
};
function adopt(s) { if (s?.generation) generation = s.generation; return s; }

/** Retries an admission call while the site restarts a service (the official client does the same). */
async function admit(path, body) {
  for (let i = 0; ; i++) {
    try { return await api(path, body); }
    catch (e) {
      if (e.status === 409 && e.code === "GENERATION_DRAINING") { const c = await api("/api/config").catch(() => null); if (c?.generation) generation = c.generation; }
      else if (!((e.status === 503 || e.code === "ROSTER_BUSY") && i < 12)) throw e;
      await new Promise((r) => setTimeout(r, e.status === 409 ? 800 : 4000));
    }
  }
}
export const createRoom = (settings) => admit("/api/create", { name: account.name, ...settings }).then(adopt);
export const joinRoom = (code, { password, role = "player" } = {}) => admit("/api/join", { code, name: account.name, password, role }).then(adopt);

/** The quick game's search: a ticket polled every second until the server pairs it. */
// The search ticket is kept on the phone: a search left running when the app was closed is called off before a
// new one starts (the server allows one search per account: «Поиск уже запущен в другой вкладке»).
const QUICK_KEY = "derbyo-quick-ticket";
const keepTicket = (t) => { try { if (t) localStorage.setItem(QUICK_KEY, t); else localStorage.removeItem(QUICK_KEY); } catch {} };
export const quick = {
  async start(presets, allowBot = false, people = {}) {
    let old = null;
    try { old = localStorage.getItem(QUICK_KEY); } catch {}
    if (old) { await api("/api/quick/cancel", { ticket: old }).catch(() => null); keepTicket(null); }
    const r = await admit("/api/quick", { name: account.name, presets, allowBot, ...(people.coaches === false ? { coaches: false } : {}), ...(people.teammates === false ? { teammates: false } : {}) });
    keepTicket(r.status === "matched" ? null : r.ticket);
    return r;
  },
  async status(ticket) {
    const r = await api("/api/quick/status", { ticket });
    if (r.status === "matched") keepTicket(null);
    return r;
  },
  cancel: (ticket) => { keepTicket(null); return api("/api/quick/cancel", { ticket }).catch(() => null); },
};

/** Is the match stream live? "ok", or "reconnecting" while it is being restored; the match screen shows a strip. */
export const link = {
  state: "ok",
  set(v) { if (this.state !== v) { this.state = v; store.changed(); } },
};

/** The match stream: fetch with the room token (EventSource cannot send it), `data:` frames only.
 * A watchdog drops a stream silent for 30 s (the server beats every 12 s), even before its headers arrive; after a drop it
 * comes back at once, then with a growing pause (1 s → 15 s, with jitter, longer on a 429). Coming back to the app, the
 * network returning or the page being shown again reconnects straight away. Stops on `replaced` or `closed`. */
export function openStream(token, onFrame) {
  let stopped = false, ctl = null, watchdog = null, failures = 0, nap = null, heard = Date.now();
  const kick = () => { heard = Date.now(); clearTimeout(watchdog); watchdog = setTimeout(() => ctl?.abort(), 30000); };
  // Back from the background a socket may be dead without knowing it: nothing heard for 15 s means start again.
  const wake = () => { if (stopped) return; if (nap) nap(); else if (link.state !== "ok" || Date.now() - heard > 15000) ctl?.abort(); };
  const onVisible = () => { if (!document.hidden) wake(); };
  addEventListener("online", wake); addEventListener("pageshow", wake); document.addEventListener("visibilitychange", onVisible);
  const run = async () => {
    while (!stopped) {
      ctl = new AbortController();
      let status = 0;
      kick();
      try {
        // The client marker tells the server this player sees the match intro (the first turn waits for it).
        const headers = { Authorization: `Bearer ${token}`, "X-Derbyo-Presence": document.hidden ? "hidden" : "active", "X-Derbyo-Client": "app" };
        if (generation) headers["X-Derbyo-Generation"] = generation;
        const r = await fetch("/api/events", { headers, signal: ctl.signal, cache: "no-store" });
        status = r.status;
        if ([401, 404, 410].includes(r.status)) { onFrame({ type: "closed", message: "Комната закрыта" }); return; }
        if (!r.ok || !r.body) throw new Error(String(r.status));
        kick();
        const reader = r.body.getReader(), dec = new TextDecoder();
        let buf = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          kick();
          if (failures || link.state !== "ok") { failures = 0; link.set("ok"); }
          buf += dec.decode(value, { stream: true });
          let k;
          while ((k = buf.indexOf("\n\n")) >= 0) {
            const chunk = buf.slice(0, k); buf = buf.slice(k + 2);
            const line = chunk.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trimStart()).join("\n");
            if (!line) continue;
            let f; try { f = JSON.parse(line); } catch { continue; }
            if (f.type === "replaced" || f.type === "closed") { stopped = true; onFrame(f); return; }
            onFrame(f);
          }
        }
      } catch {}
      clearTimeout(watchdog);
      if (stopped) break;
      failures++;
      if (failures > 1) link.set("reconnecting");
      const pause = status === 429 ? 15000 + Math.random() * 5000 : failures === 1 ? 0 : Math.min(15000, 1000 * 2 ** (failures - 2)) * (0.7 + Math.random() * 0.6);
      await new Promise((ok) => { const t = setTimeout(() => { nap = null; ok(); }, pause); nap = () => { clearTimeout(t); nap = null; ok(); }; });
    }
  };
  run();
  return () => {
    stopped = true; clearTimeout(watchdog); link.set("ok"); nap?.();
    removeEventListener("online", wake); removeEventListener("pageshow", wake); document.removeEventListener("visibilitychange", onVisible);
    try { ctl?.abort(); } catch {}
  };
}

// MARK: photos

/** Player photos: ESPN links as they are; otherwise the Wikipedia page image of `wp` (free licence only). */
const wikiCache = new Map();
let wikiQueue = new Set(), wikiTimer = null;
export function wikiPhoto(title) {
  if (!title) return Promise.resolve(null);
  if (wikiCache.has(title)) return wikiCache.get(title);
  let done;
  const p = new Promise((r) => (done = r));
  p.done = done;
  wikiCache.set(title, p);
  wikiQueue.add(title);
  clearTimeout(wikiTimer);
  wikiTimer = setTimeout(flushWiki, 30);
  return p;
}
async function flushWiki() {
  const titles = [...wikiQueue]; wikiQueue = new Set();
  for (let i = 0; i < titles.length; i += 15) {
    const part = titles.slice(i, i + 15);
    const found = {};
    try {
      const u = `https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&prop=pageimages&piprop=thumbnail|name&pithumbsize=320&pilicense=free&redirects=1&titles=${encodeURIComponent(part.join("|"))}`;
      const q = (await (await fetch(u)).json()).query ?? {};
      const back = {};
      for (const n of q.normalized ?? []) back[n.to] = n.from;
      for (const n of q.redirects ?? []) back[n.to] = back[n.from] ?? n.from;
      for (const pg of Object.values(q.pages ?? {})) {
        const src = pg.thumbnail?.source;
        if (src && /^https:\/\/(upload|thumb)\.wikimedia\.org\//.test(src)) found[back[pg.title] ?? pg.title] = src;
      }
    } catch {}
    for (const t of part) { resolved.set(t, found[t] ?? null); wikiCache.get(t)?.done(found[t] ?? null); }
  }
  store.changed();
}
/** The photo to show right now (null until a Wikipedia lookup lands, then a redraw). */
const resolved = new Map();
export function photoOf(x) {
  if (!x) return null;
  if (x.photo && /^https:\/\/a\.espncdn\.com\//.test(x.photo)) return x.photo;
  if (x.photo && x.photo.startsWith("/assets/")) return x.photo;
  if (!x.wp) return null;
  if (resolved.has(x.wp)) return resolved.get(x.wp);
  wikiPhoto(x.wp);
  return null;
}

/** Live on the site's API: on this app's own host. The GitHub Pages copy and `?demo…` links stay the offline prototype. */
export const ONLINE = ![...new URLSearchParams(location.search).keys()].some((k) => k.startsWith("demo")) && !location.hostname.endsWith("github.io");

/** Web push on the sandbox server: the phone's subscription and which kinds it wants. */
export const pushApi = {
  key: () => api("/api/push/key").then((r) => r.key),
  subscribe: (subscription, prefs) => api("/api/push/subscribe", { subscription, prefs }),
  prefs: (endpoint, prefs) => api("/api/push/prefs", { endpoint, prefs }),
  unsubscribe: (endpoint) => api("/api/push/unsubscribe", { endpoint }),
};

/** A message to the team (the site's own feedback box). */
/** Counts the app in the site's visit statistics as the site's pages do: a ping every 30 s while it is on screen. */
export function startVisitPing() {
  if (!ONLINE) return;
  const tab = uuid().replace(/-/g, "");
  const ping = () => api("/api/site-presence", { tab, active: !document.hidden }).catch(() => {});
  ping();
  setInterval(() => { if (!document.hidden) ping(); }, 30000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) ping(); });
}
export const sendFeedback = (message, context = {}) => api("/api/feedback", { message, context });
