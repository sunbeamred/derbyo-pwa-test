// New versions: a small fix loads by itself at a quiet moment; a release the owner announces shows the «Обновить» bubble.
// Every publish raises BUILD here, `version` in version.json and VERSION in sw.js to the same number.
// An announced one also sets `announce` in version.json to that number, with a short `text` for the bubble.
export const BUILD = 49;

let latest = null;
export const updates = {
  async check() {
    try { const r = await fetch("version.json", { cache: "no-store" }); if (r.ok) latest = await r.json(); } catch {}
    return this.state();
  },
  /** null (up to date), "silent" or "announce". */
  state() {
    if (!latest || !(latest.version > BUILD)) return null;
    if (latest.announce > BUILD) return "announce";
    // One quiet reload per version: if the new code has not reached us yet, try again on the next launch, not in a loop.
    try { if (sessionStorage.getItem("reloaded-for") === String(latest.version)) return null; } catch {}
    return "silent";
  },
  get text() { return latest?.text || "Новая версия приложения"; },
  apply() { try { sessionStorage.setItem("reloaded-for", String(latest?.version)); } catch {} location.reload(); },
};
