// Friends' calls to a game, shared by the bubbles over the menu and the friends list: one poll of the site's social state,
// every few seconds while a call is open, every 15 s otherwise.
import { social, account } from "./net.js";

let list = [], timer = null, running = false;
const listeners = new Set();
const changed = () => listeners.forEach((f) => f(list));

export const invites = {
  /** True while you play a match yourself (minimised or open): no calls out, the button is grey. */
  busy: false,
  get list() { return list; },
  on(f) { listeners.add(f); return () => listeners.delete(f); },
  /** A call made or answered just now: look again at once. */
  async refresh() {
    try { const st = await social.state(); list = (st.invites ?? []).filter((i) => i.expires > Date.now()); changed(); } catch {}
    return list;
  },
  start() {
    if (running) return;
    running = true;
    const tick = async () => {
      if (!document.hidden && account.profile?.registered) await invites.refresh();
      // Expired calls drop out between polls too.
      list = list.filter((i) => i.expires > Date.now());
      timer = setTimeout(tick, list.length ? 3000 : 15000);
    };
    tick();
  },
  stop() { running = false; clearTimeout(timer); },
};
export const secondsLeft = (i) => Math.max(0, Math.ceil((i.expires - Date.now()) / 1000));
