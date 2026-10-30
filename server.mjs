// Test host for the PWA: serves the app's own files, and passes everything else to derbyo.online, so the app
// and the site's API share one origin (the site's server only answers its own origin, cookies are SameSite=Strict).
// Nothing on the site changes: to it, this is one more browser.
import http from "node:http";
import https from "node:https";
import { readFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import zlib from "node:zlib";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const UPSTREAM = new URL(process.env.UPSTREAM || "https://derbyo.online");
const PORT = Number(process.env.PORT || 3060);
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml", ".json": "application/json", ".webmanifest": "application/manifest+json", ".wav": "audio/wav" };
// The proxy's own source never goes out as a page.
const PRIVATE = new Set(["/server.mjs", "/package.json"]);
const GAME = /^\/(daily|contexto|links|games)$/;
// Text is sent compressed (brotli, else gzip): on a slow phone line that is a quarter of the bytes.
const TEXTY = /^(text\/|application\/(json|javascript|manifest\+json)|image\/svg)/;
const pickEncoding = (req) => { const a = String(req.headers["accept-encoding"] || ""); return /\bbr\b/.test(a) ? "br" : /\bgzip\b/.test(a) ? "gzip" : null; };
const squeeze = (enc, body) => enc === "br" ? zlib.brotliCompressSync(body, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 9 } }) : zlib.gzipSync(body, { level: 9 });
const squeezer = (enc) => enc === "br" ? zlib.createBrotliCompress({ params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 4 } }) : zlib.createGzip({ level: 6 });
// Each file once per change: its body, its tag and its compressed forms.
const files = new Map();
async function served(file) {
  const s = await stat(file), hit = files.get(file);
  if (hit && hit.mtime === s.mtimeMs) return hit;
  const body = await readFile(file);
  const f = { mtime: s.mtimeMs, body, etag: `"${createHash("sha1").update(body).digest("base64url").slice(0, 20)}"`, packed: {} };
  files.set(file, f);
  return f;
}

async function local(path) {
  if (PRIVATE.has(path)) return null;
  const file = normalize(join(ROOT, path === "/" ? "index.html" : path));
  if (!file.startsWith(ROOT)) return null;
  try { const s = await stat(file); return s.isFile() ? file : null; } catch { return null; }
}

function proxy(req, res) {
  const headers = { ...req.headers, host: UPSTREAM.host };
  // To the site this is a same-origin request from its own page.
  if (headers.origin) headers.origin = UPSTREAM.origin;
  if (headers.referer) headers.referer = UPSTREAM.origin + new URL(headers.referer, "http://x").pathname;
  if (headers["sec-fetch-site"]) headers["sec-fetch-site"] = "same-origin";
  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket.remoteAddress;
  headers["x-forwarded-for"] = ip;
  delete headers["x-forwarded-host"]; delete headers["x-forwarded-proto"];
  // A game page is rewritten below, so it comes uncompressed.
  const gamePage = GAME.test(new URL(req.url, "http://x").pathname);
  if (gamePage) headers["accept-encoding"] = "identity";
  // The sandbox server takes the phone's address (for its country) only with this key; a client can never send its own.
  delete headers["x-derbyo-proxy-key"]; delete headers["x-derbyo-client-ip"];
  if (process.env.PROXY_KEY) { headers["x-derbyo-proxy-key"] = process.env.PROXY_KEY; headers["x-derbyo-client-ip"] = String(req.headers["x-real-ip"] || ip); }
  // A plain-http upstream is a local copy of the server, for testing.
  const up = (UPSTREAM.protocol === "http:" ? http : https).request({ host: UPSTREAM.hostname, port: UPSTREAM.port || (UPSTREAM.protocol === "http:" ? 80 : 443), path: req.url, method: req.method, headers }, (r) => {
    const out = { ...r.headers };
    // Cookies belong to this host: no Domain attribute pointing at the site.
    if (out["set-cookie"]) out["set-cookie"] = out["set-cookie"].map((c) => c.replace(/;\s*Domain=[^;]*/i, ""));
    if (out.location) out.location = out.location.replace(UPSTREAM.origin, "");
    delete out["strict-transport-security"];
    // The site's policy names its own origin; this host serves other files and must not inherit it.
    delete out["content-security-policy"];
    // The site's mini-game pages open inside the app (an iframe of this same host); their files must come from the site too.
    if (out["x-frame-options"]) out["x-frame-options"] = "SAMEORIGIN";
    delete out["referrer-policy"];
    if (String(out["content-type"] || "").startsWith("text/event-stream")) { out["x-accel-buffering"] = "no"; out["cache-control"] = "no-cache"; }
    // The game page's own /app.css would share a URL (and a browser cache entry) with the app's: it is loaded as /site/app.css.
    if (gamePage && String(out["content-type"] || "").startsWith("text/html")) {
      const parts = [];
      r.on("data", (c) => parts.push(c));
      r.on("end", () => {
        const body = Buffer.from(Buffer.concat(parts).toString("utf8").replaceAll('"/app.css', '"/site/app.css'));
        delete out["content-encoding"]; delete out["transfer-encoding"]; out["content-length"] = String(body.length);
        res.writeHead(r.statusCode, out); res.end(body);
      });
      return;
    }
    const type = String(out["content-type"] || ""), enc = pickEncoding(req);
    if (enc && !out["content-encoding"] && TEXTY.test(type) && !type.startsWith("text/event-stream") && req.method !== "HEAD" && r.statusCode !== 204 && r.statusCode !== 304) {
      delete out["content-length"]; out["content-encoding"] = enc; out.vary = out.vary ? out.vary + ", Accept-Encoding" : "Accept-Encoding";
      res.writeHead(r.statusCode, out);
      r.pipe(squeezer(enc)).pipe(res);
      return;
    }
    res.writeHead(r.statusCode, out);
    if (res.flushHeaders) res.flushHeaders();
    r.pipe(res);
  });
  up.on("error", (e) => { console.error("upstream", req.method, req.url, e.message); if (!res.headersSent) res.writeHead(502, { "content-type": "application/json" }); res.end('{"ok":false,"error":"Сайт недоступен"}'); });
  res.on("close", () => { if (!res.writableEnded) up.destroy(); });
  req.pipe(up);
}

http.createServer(async (req, res) => {
  // /site/… is the site's own file of the same name as one of the app's (the game pages' /app.css).
  if (req.url.startsWith("/site/")) { req.url = req.url.slice(5); return proxy(req, res); }
  const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (path === "/healthz") { res.writeHead(200); res.end("ok"); return; }
  // A mini-game page (and every file it loads, which names it as the referrer) is the site's, not the app's: its /app.css is not ours.
  const fromGame = GAME.test(path) || GAME.test(new URL(req.headers.referer || "/", "http://x").pathname);
  const file = (req.method === "GET" || req.method === "HEAD") && !path.startsWith("/api/") && !fromGame ? await local(path) : null;
  if (!file) return proxy(req, res);
  const f = await served(file);
  const type = TYPES[extname(file)] || "application/octet-stream";
  // Code and the shell revalidate on every load (a 304 when unchanged); art can stay a day.
  const cache = /\.(html|js|css|webmanifest|json)$/.test(file) ? "no-cache" : "public, max-age=86400";
  const head = { "content-type": type, "cache-control": cache, "x-content-type-options": "nosniff", etag: f.etag, vary: "Accept-Encoding" };
  if (req.headers["if-none-match"] === f.etag) { res.writeHead(304, head); res.end(); return; }
  const enc = TEXTY.test(type) && f.body.length > 1024 ? pickEncoding(req) : null;
  const body = enc ? (f.packed[enc] ??= squeeze(enc, f.body)) : f.body;
  if (enc) head["content-encoding"] = enc;
  head["content-length"] = String(body.length);
  res.writeHead(200, head);
  res.end(req.method === "HEAD" ? undefined : body);
}).listen(PORT, () => console.log(`derbyo app test on :${PORT} → ${UPSTREAM.origin}`));
