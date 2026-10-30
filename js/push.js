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
const registration = () => navigator.serviceWorker.ready;

export const notifications = {
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
    const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(await pushApi.key()) }));
    await pushApi.subscribe(sub.toJSON(), this.prefs);
  },
  async disable() {
    const sub = await this.subscription();
    if (!sub) return;
    await pushApi.unsubscribe(sub.endpoint).catch(() => {});
    await sub.unsubscribe().catch(() => {});
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
