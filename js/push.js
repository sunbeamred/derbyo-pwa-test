// Notifications: a friend's call to a game and friend requests reach the phone as web push.
// On iPhone this works only in the app opened from the home screen (iOS 16.4+).
import { pushApi } from "./net.js";
import { isStandalone, isIOS } from "./install.js";

export const PUSH_KINDS = [
  ["invites", "Приглашения в игру", "Друг зовёт сыграть или принял твоё приглашение"],
  ["friends", "Друзья", "Заявки в друзья и ответы на них"],
];
const PREFS = "push-prefs", ASKED = "push-asked";
const read = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
const keyBytes = (b64) => Uint8Array.from(atob((b64 + "=".repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
// The service worker can take a moment on a cold start; a stuck one gives an error, not an endless wait.
const registration = () => Promise.race([navigator.serviceWorker.ready,
  new Promise((_, no) => setTimeout(() => no(new Error("Не удалось включить: перезапусти приложение и попробуй ещё раз")), 15000))]);
const listeners = new Set();
const BLOCKED = () => navigator.brave
  ? "В Brave включи: Настройки → Конфиденциальность → «Сервисы Google для push-сообщений», затем попробуй снова"
  : "Браузер не дал включить уведомления. Попробуй ещё раз или в другом браузере";
const changed = () => listeners.forEach((f) => f());

export const notifications = {
  /** The settings row redraws when the ask sheet (or anything else) turns pushes on or off. */
  onChange(f) { listeners.add(f); return () => listeners.delete(f); },
  /** The browser can do push here; on iPhone only from the home-screen app. */
  supported: () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window && isSecureContext && (!isIOS() || isStandalone()),
  permission: () => ("Notification" in window ? Notification.permission : "default"),
  get prefs() { try { return { invites: true, friends: true, ...JSON.parse(read(PREFS)) }; } catch { return { invites: true, friends: true }; } },
  async subscription() { return this.supported() ? (await registration()).pushManager.getSubscription() : null; },
  async enabled() { return this.permission() === "granted" && !!(await this.subscription()); },
  /** Call straight from a tap: iOS asks for permission only in a user gesture. */
  async enable() {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") throw new Error(perm === "denied" ? "Уведомления запрещены в настройках телефона" : "Уведомления не включены");
    const reg = await registration();
    const key = keyBytes(await pushApi.key());
    let sub = await reg.pushManager.getSubscription();
    // Brave has no push service until «Use Google services for push messaging» is on; there subscribe fails or never answers.
    if (!sub) sub = await Promise.race([reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }),
      new Promise((_, no) => setTimeout(() => no(new Error("timeout")), 15000))]).catch((e) => { throw new Error(`${BLOCKED()} (${e?.name && e.name !== "Error" ? e.name + ": " : ""}${e?.message || e})`); });
    await pushApi.subscribe(sub.toJSON(), this.prefs);
    changed();
  },
  async disable() {
    const sub = await this.subscription();
    if (!sub) return;
    await pushApi.unsubscribe(sub.endpoint).catch(() => {});
    await sub.unsubscribe().catch(() => {});
    changed();
  },
  async setPrefs(p) {
    write(PREFS, JSON.stringify(p));
    const sub = await this.subscription();
    if (sub) await pushApi.prefs(sub.endpoint, p);
  },
  /** At launch: ties this phone's subscription to the account now signed in (after a login on another account too). */
  async refresh() { const sub = await this.subscription().catch(() => null); if (sub && this.permission() === "granted") await pushApi.subscribe(sub.toJSON(), this.prefs).catch(() => {}); },
  /** Before logging out: this phone stops getting the account's pushes. */
  async forget() { const sub = await this.subscription().catch(() => null); if (sub) await pushApi.unsubscribe(sub.endpoint).catch(() => {}); },
  /** Asked once, in the installed app, of a signed-in player who has not decided yet. */
  shouldAsk: () => notifications.supported() && isStandalone() && notifications.permission() === "default" && read(ASKED) === null,
  asked: () => write(ASKED, "1"),
};
