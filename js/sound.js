// The site's game sounds (port of Sound.swift). Off by default, like the site; only game events sound.
const KEY = "derbyo-sound";
let ctx = null;
const buffers = {};
let cue = null;

export const Sound = {
  get enabled() { try { return localStorage.getItem(KEY) === "1"; } catch { return false; } },
  set enabled(v) { try { localStorage.setItem(KEY, v ? "1" : "0"); } catch {} if (v) Sound.prepare(); },
  /** Must first run inside a tap, or iOS keeps the audio context muted. */
  prepare() {
    if (!ctx) { const A = window.AudioContext || window.webkitAudioContext; if (!A) return; ctx = new A(); }
    if (ctx.state === "suspended") ctx.resume();
    for (const k of ["good", "bad", "turn", "join", "chat", "win", "series-complete", "presence-away", "presence-back", "timer-15", "timer-5"]) {
      if (buffers[k]) continue;
      buffers[k] = fetch(`snd/${k}.wav`).then((r) => r.arrayBuffer()).then((b) => new Promise((ok, no) => ctx.decodeAudioData(b, ok, no))).catch(() => null);
    }
  },
  async play(kind) {
    if (!Sound.enabled) return;
    if (!ctx) Sound.prepare();
    const buf = await buffers[kind];
    if (!buf || !ctx) return;
    const src = ctx.createBufferSource();
    src.buffer = buf; src.connect(ctx.destination);
    // The round and match cues replace each other.
    if (kind === "win" || kind === "series-complete") { try { cue?.stop(); } catch {} cue = src; }
    src.start();
  },
};
