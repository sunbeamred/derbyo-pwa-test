// Friends' calls to a game, shared by the bubbles over the menu and the friends list: one poll of the site's social state,
// every few seconds while a call is open, every 15 s otherwise.
import { social, account } from "./net.js";

let list = [], timer = null, running = false;
// Calls you already took into a room: the server keeps them a little longer, the bubble goes at once.
const taken = new Set();
const listeners = new Set();
const changed = () => listeners.forEach((f) => f(list));

export const invites = {
  /** True while you play a match yourself (minimised or open): no calls out, the button is grey. */
  busy: false,
  /** The minimised match ({ code, names }), so the friends list can offer «Вернуться» for it. */
  current: null,
  get list() { return list; },
  on(f) { listeners.add(f); return () => listeners.delete(f); },
  /** A call made or answered just now: look again at once. */
  async refresh() {
    try { const st = await social.state(); list = (st.invites ?? []).filter((i) => i.expires > Date.now() && !taken.has(i.id)); changed(); } catch {}
    return list;
  },
  /** «Войти» worked: this call is done. */
  taken(id) { taken.add(id); list = list.filter((i) => i.id !== id); changed(); },
  start() {
    if (running) return;
    running = true;
    const tick = async () => {
      if (!document.hidden && account.profile?.registered) await invites.refresh();
      // Expired calls drop out between polls too.
      list = list.filter((i) => i.expires > Date.now());
      // While your call waits for an answer, look often: «принял» should show at once.
      timer = setTimeout(tick, list.some((i) => i.direction === "outgoing" && i.status === "pending") ? 1200 : list.length ? 3000 : 15000);
    };
    tick();
  },
  stop() { running = false; clearTimeout(timer); },
};
export const secondsLeft = (i) => Math.max(0, Math.ceil((i.expires - Date.now()) / 1000));
