// The site's API (derbyo.online, reached through this host's proxy, so same origin): requests, the account,
// the match stream. The protocol is the site's own client's (public/lab.js); nothing here is invented.
import { store } from "./model.js";

let generation = null;
/** The site's settings: presets, themes, the fleet generation the requests must name. */
export let config = null;

export class ApiError extends Error {
  constructor(status, body) { super(body?.error || `Ошибка ${status}`); this.status = status; this.code = body?.code; }
}

/** One request to the site. POSTs carry JSON; the fleet needs the generation on every request. */
export async function api(path, body, { token, method } = {}) {
  const headers = {};
  if (generation) headers["X-Derbyo-Generation"] = generation;
  if (token) headers.Authorization = `Bearer ${token}`;
  const post = body !== undefined || method === "POST";
  if (post) headers["Content-Type"] = "application/json";
  let r;
  try { r = await fetch(path, { method: post ? "POST" : "GET", headers, body: post ? JSON.stringify(body ?? {}) : undefined, cache: "no-store" }); }
  catch { throw new ApiError(0, { error: "Нет связи с сервером" }); }
  let data = null;
  try { data = await r.json(); } catch {}
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
    const [me, cfg] = await Promise.all([api("/api/account/me"), api("/api/config").catch(() => null)]);
    this.profile = me.profile;
    if (cfg) { config = cfg; generation = cfg.generation ?? null; }
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
export const quick = {
  start: (presets, allowBot = false) => admit("/api/quick", { name: account.name, presets, allowBot }),
  status: (ticket) => api("/api/quick/status", { ticket }),
  cancel: (ticket) => api("/api/quick/cancel", { ticket }).catch(() => null),
};

/** The match stream: fetch with the room token (EventSource cannot send it), `data:` frames only.
 * Reconnects 1.5 s after a drop and when nothing arrives for 45 s; stops on `replaced` or `closed`. */
export function openStream(token, onFrame) {
  let stopped = false, ctl = null, watchdog = null;
  const run = async () => {
    while (!stopped) {
      ctl = new AbortController();
      const kick = () => { clearTimeout(watchdog); watchdog = setTimeout(() => ctl.abort(), 45000); };
      try {
        const headers = { Authorization: `Bearer ${token}`, "X-Derbyo-Presence": document.hidden ? "hidden" : "active" };
        if (generation) headers["X-Derbyo-Generation"] = generation;
        const r = await fetch("/api/events", { headers, signal: ctl.signal, cache: "no-store" });
        if ([401, 404, 410].includes(r.status)) { onFrame({ type: "closed", message: "Комната закрыта" }); return; }
        if (!r.ok || !r.body) throw new Error(String(r.status));
        kick();
        const reader = r.body.getReader(), dec = new TextDecoder();
        let buf = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          kick();
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
      if (!stopped) await new Promise((r) => setTimeout(r, 1500));
    }
  };
  run();
  return () => { stopped = true; clearTimeout(watchdog); try { ctl?.abort(); } catch {} };
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
