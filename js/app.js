// The app shell (port of DerbyoApp.swift): tabs, the play tab's screen stack, the match and search covers,
// the bar that returns to a minimised match, and the offer to install on the home screen.
import { html, render, useState, useEffect, useReducer, useRef } from "../vendor/preact-htm.js";
import { cx, img, Icon, Alert } from "./ui/common.js";
import { has } from "./data.js";
import { Match, Opponent, store } from "./model.js";
import { MatchScreen } from "./ui/match.js";
import { HomeView, GameLobby, QuickPickView, SearchView, RoomView, JoinCodeView, LockerRoom, MatchSettingsView } from "./ui/lobby.js";
import { InstallSheet, installState, InstallRow, isStandalone, isIOS } from "./install.js";
import { TabBar } from "./ui/tabbar.js";
import "./touch.js";

const SCREENS = { lobby: GameLobby, quickPick: QuickPickView, room: RoomView, code: JoinCodeView, locker: LockerRoom, settings: MatchSettingsView };
const matchDemo = ["demoBoard", "demoWin", "demoWinLater", "demoLoseLater", "demoLongMatch", "demoMix", "demoLastMove", "demoOppReview", "demoMismatch", "demoHuman", "demoFriendAsk", "demoWatch"].some(has);
const humanDemo = ["demoOppAway", "demoHuman", "demoFriendAsk", "demoWatch", "demoOppIdle", "demoOppLeaves", "demoOppPause"].some(has);
/** How long a screen takes to slide in or out, and a cover to rise or fall (ms). */
const PUSH_MS = 380, COVER_MS = 420;

function initialStack() {
  const s = [];
  if (["demoLobby", "demoRoom", "demoSettings", "demoQuickPick", "demoLocker", "demoCode"].some(has)) s.push({ name: "lobby", props: {} });
  if (has("demoRoom") || has("demoSettings")) s.push({ name: "room", props: {} });
  if (has("demoQuickPick")) s.push({ name: "quickPick", props: {} });
  if (has("demoCode")) s.push({ name: "code", props: {} });
  if (has("demoLocker")) s.push({ name: "locker", props: { host: "Zhanbo" } });
  return s.map((x, i) => ({ ...x, key: i + 1, at: 0 }));
}
let keys = 100;
const depth = () => history.state?.d ?? 0;

/** A full-screen cover that rises from the bottom edge and falls back when `leaving` is set. */
const Cover = ({ leaving, children, class: c }) => html`<div class=${cx("cover", c, leaving && "leaving")}>${children}</div>`;

function App() {
  const [, redraw] = useReducer((n) => n + 1, 0);
  const [tab, setTab] = useState(1);
  const [stack, setStack] = useState(initialStack);
  const [leaving, setLeaving] = useState(null);
  const [match, setMatch] = useState(() => (matchDemo ? new Match(humanDemo ? Opponent.human() : Opponent.bot()) : null));
  const [matchLeaving, setMatchLeaving] = useState(false);
  const [minimized, setMinimized] = useState(null);
  const [searching, setSearching] = useState(false);
  const [searchLeaving, setSearchLeaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [install, setInstall] = useState(() => installState.shouldOffer());
  const live = useRef({});
  const stackRef = useRef();
  /** Our own history.back() for a cover: its popstate must not also pop a screen. */
  const skipPop = useRef(false);
  /** The next pop is already shown (a finished swipe), so it lands without sliding again. */
  const instantPop = useRef(false);
  const leaveTimer = useRef();
  /** What to do once the back step has landed (history.back() is asynchronous). */
  const afterPop = useRef(null);
  live.current = { match, minimized, stack, searching, leaving, tab, matchLeaving };

  useEffect(() => store.on(redraw), []);
  // One clock for the match, open or minimised: it keeps running while you look at the tabs.
  useEffect(() => {
    const t = setInterval(() => { const m = live.current.match ?? live.current.minimized; if (m) { m.tick(); store.changed(); } }, 1000);
    return () => clearInterval(t);
  }, []);
  // Every tap redraws after its handler has run, so model changes always show.
  useEffect(() => {
    const f = () => queueMicrotask(store.changed);
    document.addEventListener("click", f);
    return () => document.removeEventListener("click", f);
  }, []);

  /** Pops the play stack down to `n` screens; the top one slides out unless the gesture already showed it. */
  const popTo = (n, animate) => {
    const s = live.current.stack;
    if (n >= s.length) return;
    const top = s[s.length - 1];
    setStack(s.slice(0, n));
    clearTimeout(leaveTimer.current);
    if (animate && !reduceMotion()) { setLeaving({ ...top, at: Date.now() }); leaveTimer.current = setTimeout(() => setLeaving(null), PUSH_MS); }
    else setLeaving(null);
  };

  // The browser's back (Android button, Safari edge swipe) walks the play stack; in a match it minimises it.
  useEffect(() => {
    // Demo screens opened at launch get their history entries, so «Назад» stays inside the app.
    live.current.stack.forEach((_, i) => history.pushState({ d: i + 1 }, ""));
    if (live.current.match) history.pushState({ d: live.current.stack.length, cover: true }, "");
    const f = () => {
      if (skipPop.current) { skipPop.current = false; return; }
      const l = live.current;
      const cover = !!history.state?.cover;
      if (l.match && !cover) { minimize(); return; }
      if (l.searching && !cover) { closeSearch(); return; }
      // Safari's own edge swipe has already slid the old page away.
      const swiped = instantPop.current || Date.now() - edgeTouchAt < 1200;
      instantPop.current = false;
      popTo(depth(), !swiped);
      const then = afterPop.current;
      afterPop.current = null;
      then?.();
    };
    let edgeTouchAt = 0;
    const t = (e) => { const x = e.touches[0]?.clientX ?? 99; if (x < 28 || x > innerWidth - 28) edgeTouchAt = Date.now(); };
    addEventListener("popstate", f);
    addEventListener("touchstart", t, { passive: true });
    return () => { removeEventListener("popstate", f); removeEventListener("touchstart", t); };
  }, []);

  const nav = {
    push: (name, props = {}) => {
      if (live.current.leaving) return;
      const s = live.current.stack;
      history.pushState({ d: s.length + 1 }, "");
      setStack([...s, { name, props, key: ++keys, at: Date.now() }]);
    },
    back: (then) => { afterPop.current = typeof then === "function" ? then : null; history.back(); },
  };
  const coverOpened = () => history.pushState({ d: depth(), cover: true }, "");
  const coverClosed = () => { if (history.state?.cover) { skipPop.current = true; history.back(); } };

  /** The cover falls, then the match goes; `then` runs once it is out of sight. */
  const dropMatch = (then) => {
    setMatchLeaving(true);
    setTimeout(() => { setMatchLeaving(false); then(); }, reduceMotion() ? 0 : COVER_MS - 40);
  };
  const open = (m) => {
    if (minimized && !minimized.watching) { setBusy(true); m.stop(); return; }
    minimized?.stop();
    setMinimized(null); setMatchLeaving(false); setMatch(m); coverOpened();
  };
  const close = () => { const m = live.current.match; m?.stop(); minimized?.stop(); setMinimized(null); coverClosed(); dropMatch(() => setMatch(null)); };
  const minimize = () => {
    const m = live.current.match;
    if (!m || live.current.matchLeaving) return;
    dropMatch(() => { setMatch(null); setMinimized(m); });
  };
  const openSearch = () => { setSearchLeaving(false); setSearching(true); coverOpened(); };
  const closeSearch = (then) => {
    setSearchLeaving(true);
    setTimeout(() => { setSearchLeaving(false); setSearching(false); then?.(); }, reduceMotion() ? 0 : COVER_MS - 40);
  };
  const app = {
    open,
    quick: () => { if (minimized && !minimized.watching) setBusy(true); else openSearch(); },
    join: (name) => open(new Match(Opponent.human(name), false)),
    watch: (name) => open(new Match(Opponent.human(name), true)),
  };
  const ret = () => { setMatch(minimized); setMinimized(null); setMatchLeaving(false); coverOpened(); };

  // Tapping the open «Играть» tab again goes back to its first screen, as in iOS.
  const pickTab = (i) => {
    if (i === live.current.tab && i === 1 && live.current.stack.length) { history.go(-live.current.stack.length); return; }
    setTab(i);
  };

  useEdgeSwipe(stackRef, live, () => { instantPop.current = true; history.back(); });

  const now = Date.now();
  const shown = leaving ? [...stack, leaving] : stack;
  const topIndex = stack.length - 1;
  const screenClass = (i, item) => cx("stack-screen",
    leaving && item === leaving ? "popping" : i < topIndex ? "under" : leaving && i === topIndex ? "uncover" : item?.at && now - item.at < PUSH_MS + 60 ? "pushed" : null);
  const playTab = html`<div class="stack" ref=${stackRef}>
    <div class=${screenClass(-1, null)} key="home" data-depth="0"><${HomeView} nav=${nav} /></div>
    ${shown.map((s, i) => {
      const S = SCREENS[s.name];
      return html`<div class=${screenClass(i, s)} key=${s.key} data-depth=${i + 1}><${S} nav=${nav} app=${app} ...${s.props} /></div>`;
    })}
  </div>`;

  return html`<div class=${cx("app", minimized && !match && "has-return")}>
    <main class="tab-body">
      <section class="tab-pane" hidden=${tab !== 0}><${Placeholder} title="Рейтинг" text="Неделя и всё время, все и друзья, твоё место снизу. Следующий шаг прототипа." /></section>
      <section class="tab-pane" hidden=${tab !== 1}>${playTab}</section>
      <section class="tab-pane" hidden=${tab !== 2}><${Placeholder} title="Профиль" text="Статистика, история, друзья и заявки, настройки звука, вибро и уведомлений. Следующий шаг прототипа.">
        <${InstallRow} open=${() => setInstall(true)} /><//></section>
    </main>
    <div class="edge-fade" aria-hidden="true"></div>
    ${minimized && !match ? html`<${ReturnBar} m=${minimized} go=${ret} />` : null}
    <${TabBar} tab=${tab} pick=${pickTab} items=${[["Рейтинг", "trophy"], ["Играть", "bolt"], ["Профиль", "profile-v1", 1]]} />
    ${searching ? html`<${Cover} class="search-cover" leaving=${searchLeaving}><${SearchView} done=${(opp) => {
      coverClosed();
      closeSearch(opp ? () => open(new Match(opp, false)) : null);
    }} /><//>` : null}
    ${match ? html`<${Cover} leaving=${matchLeaving}><${MatchScreen} m=${match} key=${match.code} close=${close} minimize=${() => { coverClosed(); minimize(); }}
      findNew=${() => { close(); setTimeout(openSearch, COVER_MS); }} /><//>` : null}
    ${busy ? html`<${Alert} title="Сначала заверши матч" onClose=${() => setBusy(false)}
      message=${`Ты ещё играешь с ${minimized?.opponent.name ?? "соперником"}. Доиграй или выйди из матча — потом можно в другую комнату.`}
      actions=${[{ title: "Вернуться в матч", kind: "bold", run: () => { setBusy(false); ret(); } }, { title: "Отмена", run: () => setBusy(false) }]} />` : null}
    ${install && !match ? html`<${InstallSheet} close=${() => setInstall(false)} />` : null}
    <input id="kbd-proxy" aria-hidden="true" tabindex="-1" />
  </div>`;
}

const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/** iOS's swipe from the left edge back to the previous screen. In Safari the browser does this itself,
 * so the app's own gesture runs only where it does not: installed on the home screen, or not on iOS. */
function useEdgeSwipe(ref, live, done) {
  useEffect(() => {
    const el = ref.current;
    if (!el || (isIOS() && !isStandalone())) return;
    let g = null;
    const start = (e) => {
      const t = e.touches[0], l = live.current;
      if (e.touches.length > 1 || t.clientX > 24 || !l.stack.length || l.leaving || l.match || l.searching) return;
      const screens = el.querySelectorAll(":scope > .stack-screen");
      const top = screens[screens.length - 1], under = screens[screens.length - 2];
      if (!top || !under) return;
      g = { x: t.clientX, y: t.clientY, top, under, w: el.clientWidth, dx: 0, v: 0, at: e.timeStamp, on: false };
    };
    const move = (e) => {
      if (!g) return;
      const t = e.touches[0], dx = Math.max(0, t.clientX - g.x);
      if (!g.on) {
        if (Math.abs(t.clientY - g.y) > 12 && Math.abs(t.clientY - g.y) > dx) { g = null; return; }
        if (dx < 6) return;
        g.on = true;
        for (const s of [g.top, g.under]) { s.style.animation = "none"; s.style.transition = "none"; }
        g.under.style.visibility = "visible";
        g.top.classList.add("dragging");
      }
      e.preventDefault();
      const dt = Math.max(1, e.timeStamp - g.at);
      g.v = (dx - g.dx) / dt; g.dx = dx; g.at = e.timeStamp;
      paint(g, dx / g.w);
    };
    const end = () => {
      if (!g) return;
      const s = g; g = null;
      if (!s.on) return;
      const go = s.dx > s.w * 0.4 || (s.v > 0.35 && s.dx > 20);
      const ease = `transform ${go ? 0.26 : 0.32}s cubic-bezier(.2,.8,.3,1), filter .3s`;
      s.top.style.transition = ease; s.under.style.transition = ease;
      paint(s, go ? 1 : 0);
      const reset = () => {
        for (const x of [s.top, s.under]) { x.style.transition = x.style.transform = x.style.animation = x.style.filter = x.style.visibility = ""; }
        s.top.classList.remove("dragging");
      };
      // A finished swipe hides the old screen and waits for the stack to drop it before letting go of the styles.
      setTimeout(() => { if (go) { s.top.style.visibility = "hidden"; done(); setTimeout(reset, 180); } else reset(); }, go ? 260 : 320);
    };
    el.addEventListener("touchstart", start, { passive: true });
    el.addEventListener("touchmove", move, { passive: false });
    el.addEventListener("touchend", end);
    el.addEventListener("touchcancel", end);
    return () => { el.removeEventListener("touchstart", start); el.removeEventListener("touchmove", move); el.removeEventListener("touchend", end); el.removeEventListener("touchcancel", end); };
  }, []);
}
function paint(g, f) {
  g.top.style.transform = `translate3d(${f * 100}%,0,0)`;
  g.under.style.transform = `translate3d(${(f - 1) * 30}%,0,0)`;
  g.under.style.filter = `brightness(${0.7 + 0.3 * f})`;
}

/** «Вернуться в матч»: who, the score and the round, over the tab bar on every tab. */
const ReturnBar = ({ m, go }) => html`<button class="return-bar glass-bar press" onClick=${go}>
  <span class="rb-dot"><i></i></span>
  <span class="rb-t"><small>${m.watching ? "Ты на трибуне" : "Матч идёт"}</small>
    <b>${m.watching ? m.leftName + " — " : ""}${m.opponent.name} · ${m.score[0]}:${m.score[1]} · раунд ${m.round}</b></span>
  <span class="rb-go">Вернуться</span>
</button>`;

const Placeholder = ({ title, text, children }) => html`<div class="screen-scroll"><div class="page">
  <h1 class="big-title">${title}</h1>
  <p class="placeholder">${text}</p>
  ${children}
</div></div>`;

render(html`<${App} />`, document.getElementById("root"));
