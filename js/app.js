// The app shell (port of DerbyoApp.swift): tabs, the play tab's screen stack, the match and search covers,
// the bar that returns to a minimised match, and the offer to install on the home screen.
import { html, render, useState, useEffect, useReducer, useRef } from "../vendor/preact-htm.js";
import { cx, img, Icon, Alert, Panel } from "./ui/common.js";
import { has } from "./data.js";
import { Match, Opponent, store } from "./model.js";
import { MatchScreen } from "./ui/match.js";
import { HomeView, GameLobby, QuickPickView, SearchView, RoomView, JoinCodeView, LockerRoom, MatchSettingsView, MiniGameView } from "./ui/lobby.js";
import { InstallSheet, installState, InstallRow, isStandalone, isIOS, PushAskSheet, WhatsNewSheet, whatsNew } from "./install.js";
import { notifications } from "./push.js";
import { invites, secondsLeft } from "./invites.js";
import { updates } from "./update.js";
import { TabBar } from "./ui/tabbar.js";
import { ONLINE, account, createRoom, joinRoom, savedSession, social, sendFeedback, startVisitPing, setPlace, link } from "./net.js";
import { OnlineMatch } from "./online.js";
import { OnlineLobby, OnlineSearch, OnlineRoom, OnlineJoinCode, OnlineLocker } from "./ui/live.js";
import { RatingTab, ProfileTab, takeInvite } from "./ui/account.js";
import { DailyView } from "./ui/daily.js";
import { ContextoView, LinksView } from "./ui/games.js";
import "./touch.js";

// Online (this app's own host) the screens play on the site's server; the GitHub copy and demo links stay offline.
const SCREENS = ONLINE ? { lobby: OnlineLobby, quickPick: QuickPickView, room: OnlineRoom, code: OnlineJoinCode, locker: OnlineLocker, settings: MatchSettingsView, minigame: MiniGameView, daily: DailyView, contexto: ContextoView, links: LinksView }
  : { lobby: GameLobby, quickPick: QuickPickView, room: RoomView, code: JoinCodeView, locker: LockerRoom, settings: MatchSettingsView, minigame: MiniGameView, daily: DailyView, contexto: ContextoView, links: LinksView };
/** The admin's names for the play tab's screens (server/site-presence.mjs keeps them as given). */
const PLACES = { lobby: "grid-lobby", code: "grid-lobby", quickPick: "grid-quick", room: "grid-room", locker: "grid-room", settings: "grid-room", daily: "daily", contexto: "contexto", links: "links" };
const screenPlace = (s) => (!s ? "menu" : s.name === "minigame" ? "mini-" + (String(s.props?.game?.path ?? "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 18) || "game") : PLACES[s.name] ?? "other");
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

/** No network, or the match stream being restored: a thin strip at the top says so, and goes when the line is back. */
function NetStrip() {
  const [online, setOnline] = useState(() => navigator.onLine !== false);
  useEffect(() => {
    const f = () => setOnline(navigator.onLine !== false);
    addEventListener("online", f); addEventListener("offline", f);
    return () => { removeEventListener("online", f); removeEventListener("offline", f); };
  }, []);
  const text = !online ? "Нет интернета — ждём связь" : link.state === "reconnecting" ? "Связь пропала — переподключаемся…" : null;
  return text ? html`<div class="net-strip" role="status"><span class="spinner"></span>${text}</div>` : null;
}

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
  const [askPush, setAskPush] = useState(false);
  const [news, setNews] = useState(() => whatsNew.due());
  const [invite, setInvite] = useState(null);
  /** My calls to friends that are still open: a bubble each over the menu, with a minute's countdown. */
  const [calls, setCalls] = useState([]);
  /** The feedback sheet, from the home screen or the match menu (with the room for context). */
  const [feedback, setFeedback] = useState(null);
  const [update, setUpdate] = useState(false);
  const live = useRef({});
  const stackRef = useRef();
  /** Our own history.back() for a cover: its popstate must not also pop a screen. */
  const skipPop = useRef(false);
  /** The next pop is already shown (a finished swipe), so it lands without sliding again. */
  const instantPop = useRef(false);
  const leaveTimer = useRef();
  /** What to do once the back step has landed (history.back() is asynchronous). */
  const afterPop = useRef(null);
  /** What to do once a cover's own back step has landed. */
  const afterCover = useRef(null);
  live.current = { match, minimized, stack, searching, leaving, tab, matchLeaving };

  useEffect(() => store.on(redraw), []);
  // The profile tab reads the account again each time it opens (and when the app comes back on it): a match since
  // the last look changed the rating, which the leaderboard already shows.
  useEffect(() => {
    if (!ONLINE || tab !== 2) return;
    account.refresh();
    const f = () => { if (!document.hidden) account.refresh(); };
    document.addEventListener("visibilitychange", f);
    return () => document.removeEventListener("visibilitychange", f);
  }, [tab]);
  // Online: who you are on the site, and a match you were in before the app was closed.
  useEffect(() => {
    if (!ONLINE) return;
    account.load().catch(() => {});
    const s = savedSession.get();
    if (s?.token) setMinimized(watchClose(new OnlineMatch(s)));
  }, []);
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
    // A reload keeps the old history entries: the one we land on starts the app afresh, at its first screen.
    history.replaceState({ d: 0 }, "");
    // Demo screens opened at launch get their history entries, so «Назад» stays inside the app.
    live.current.stack.forEach((_, i) => history.pushState({ d: i + 1 }, ""));
    if (live.current.match) history.pushState({ d: live.current.stack.length, cover: true }, "");
    const f = () => {
      if (skipPop.current) { skipPop.current = false; const f = afterCover.current; afterCover.current = null; f?.(); return; }
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
    /** A room's locker; with the rooms list under it when it was opened from elsewhere (a link, an invite), so «назад» lands there. */
    locker: (m) => {
      if (live.current.leaving) return;
      const s = live.current.stack, add = s.some((x) => x.name === "lobby") ? [] : [{ name: "lobby", props: {}, key: ++keys, at: 0 }];
      add.push({ name: "locker", props: { m }, key: ++keys, at: Date.now() });
      add.forEach((_, i) => history.pushState({ d: s.length + i + 1 }, ""));
      setStack([...s, ...add]);
    },
  };
  const coverOpened = () => history.pushState({ d: depth(), cover: true }, "");
  const coverClosed = () => { if (history.state?.cover) { skipPop.current = true; history.back(); } };

  /** The cover falls, then the match goes; `then` runs once it is out of sight. */
  const dropMatch = (then) => {
    setMatchLeaving(true);
    setTimeout(() => { setMatchLeaving(false); then(); }, reduceMotion() ? 0 : COVER_MS - 40);
  };
  const open = (m) => {
    if (busyNow() && live.current.minimized !== m) { setBusy(true); m.stop(); return; }
    minimized?.stop();
    setMinimized(null); setMatchLeaving(false); setMatch(m); coverOpened();
  };
  const close = () => {
    const m = live.current.match; m?.stop(); minimized?.stop(); setMinimized(null);
    // A match that began in a room screen ends that room too: back to the list.
    const top = live.current.stack.at(-1);
    if (ONLINE && ["room", "locker"].includes(top?.name)) afterCover.current = () => nav.back();
    coverClosed(); dropMatch(() => setMatch(null));
  };
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
  /** A server match that ends (room closed, opened elsewhere) leaves the return bar. */
  function watchClose(m) { m.onClosed = () => { if (live.current.minimized === m) setMinimized(null); }; return m; }
  const busyNow = () => { const b = live.current.minimized; return b && !b.watching && !b.closed; };
  const app = {
    open: (m) => open(watchClose(m)),
    quick: () => { if (busyNow()) setBusy(true); else openSearch(); },
    join: (name) => open(new Match(Opponent.human(name), false)),
    watch: (name) => open(new Match(Opponent.human(name), true)),
    /** A practice match on the real board: your room, a bot in the other seat, ready at once. */
    bot: async (body = { preset: QUICK_BOT_PRESET() }) => {
      if (busyNow()) { setBusy(true); return; }
      try {
        const m = watchClose(new OnlineMatch(await createRoom(body)));
        open(m);
        for (let i = 0; i < 50 && !m.state && m.alive; i++) await new Promise((r) => setTimeout(r, 100));
        await m.addBot(); await m.ready();
      } catch (e) { alert(e.message); }
    },
    /** Two people on one phone (sandbox server): «Игрок 2» sits in the room already, one «готов» starts it. */
    hotseat: async (body) => {
      if (busyNow()) { setBusy(true); return; }
      try {
        const m = watchClose(new OnlineMatch(await createRoom({ ...body, hotseat: true, accessType: "open" })));
        open(m);
        for (let i = 0; i < 50 && !m.state && m.alive; i++) await new Promise((r) => setTimeout(r, 100));
        await m.ready();
      } catch (e) { alert(e.message); }
    },
    /** Joins a room by code: a seat goes to the room screen, the stands straight to the match. Resolves false on a wrong password. */
    joinRoom: async (code, { role = "player", password, onError } = {}) => {
      if (busyNow()) { setBusy(true); return true; }
      try {
        const s = await joinRoom(code, { role, password });
        const m = watchClose(new OnlineMatch(s));
        if (s.role === "player" && !s.seatTaken) {
          for (let i = 0; i < 50 && !m.state; i++) await new Promise((r) => setTimeout(r, 100));
          if (!m.hasBoard) { nav.locker(m); return true; }
        }
        open(m);
        return true;
      } catch (e) {
        if (e.code === "ROOM_PASSWORD") return false;
        (onError ?? alert)(e.message);
        return true;
      }
    },
    /** A seat the server already gave (a friend's invitation): the locker until both are ready, or the match. */
    session: async (s) => {
      if (busyNow()) { setBusy(true); return; }
      const m = watchClose(new OnlineMatch(s));
      for (let i = 0; i < 50 && !m.state; i++) await new Promise((r) => setTimeout(r, 100));
      setTab(1);
      if (!m.hasBoard) nav.locker(m); else open(m);
    },
  };
  const ret = () => { setMatch(minimized); setMinimized(null); setMatchLeaving(false); coverOpened(); };
  /** The × on the return bar: the stands or a finished match go at once; a round in play asks first (it counts as lost). */
  const [leaveAsk, setLeaveAsk] = useState(false);
  const dropNow = () => { const m = live.current.minimized; setLeaveAsk(false); if (!m) return; m.stop(); setMinimized(null); };
  const dropMinimized = () => { const m = live.current.minimized; if (m && !m.watching && !m.closed && !m.matchOver && m.g?.stage === "play" && !m.canLeaveFree) setLeaveAsk(true); else dropNow(); };

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

  // New versions (js/update.js): a quiet fix reloads at launch or while the app is in the background, never in a match;
  // an announced one waits for the player's tap on the bubble.
  useEffect(() => {
    const started = Date.now();
    const inMatch = () => !!(live.current.match || live.current.minimized);
    const run = async () => {
      const st = await updates.check();
      if (st === "silent" && !inMatch() && (document.hidden || Date.now() - started < 6000)) { updates.apply(); return; }
      setUpdate(st === "announce");
    };
    run();
    const t = setInterval(run, 5 * 60000);
    const vis = () => { if (!document.hidden) run(); else if (updates.state() === "silent" && !inMatch()) updates.apply(); };
    document.addEventListener("visibilitychange", vis);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", vis); };
  }, []);

  // Notifications (sandbox server): asked once in the installed app of a signed-in player; the phone's subscription follows the account.
  const sandbox = ONLINE && account.profile?.registered && "showFlag" in account.profile;
  useEffect(() => {
    if (!sandbox) return;
    notifications.refresh();
    if (notifications.shouldAsk()) setAskPush(true);
  }, [sandbox, account.profile?.id]);
  // A friend's call while the app is open: a banner; a tap on a push opens the app at #invite= or #friends.
  useEffect(() => {
    if (!sandbox) return;
    const seen = new Set();
    const off = invites.on((list) => {
      const i = list.find((x) => x.direction === "incoming" && x.status === "pending" && !seen.has(x.id));
      if (i) { seen.add(i.id); setInvite(i); }
      // A call into a Контекстно room waits on its seat in the room, not as a bubble over the menu.
      setCalls(list.filter((x) => x.direction === "outgoing" && x.game !== "contexto"));
    });
    invites.start();
    // The countdowns move every second while a call is open.
    const t = setInterval(() => { if (invites.list.length) setCalls(invites.list.filter((x) => x.direction === "outgoing" && x.game !== "contexto" && x.expires > Date.now())); }, 1000);
    return () => { off(); invites.stop(); clearInterval(t); };
  }, [sandbox]);
  const route = (hash) => {
    const inv = hash.match(/^#invite=([\w-]{8,64})$/);
    if (inv) social.state().then((st) => {
      const i = st.invites?.find((x) => x.id === inv[1]);
      if (!i) alert("Приглашение уже не действует");
      else return takeInvite(i);
    }).catch((e) => alert(e.message));
    else if (hash === "#friends") setTab(2);
    else return false;
    return true;
  };
  useEffect(() => {
    const onSession = (e) => app.session(e.detail);
    const onWatch = (e) => { setTab(1); app.joinRoom(e.detail, { role: "spectator" }); };
    const onReturn = () => { const m = live.current.minimized; if (!m) return; setMatch(m); setMinimized(null); setMatchLeaving(false); coverOpened(); };
    addEventListener("derbyo-watch", onWatch);
    const onInstall = () => setInstall(true);
    addEventListener("derbyo-install", onInstall);
    const onFeedback = (e) => setFeedback(e.detail || {});
    addEventListener("derbyo-feedback", onFeedback);
    addEventListener("derbyo-return", onReturn);
    const onMessage = (e) => { if (e.data?.open) route(new URL(e.data.open).hash); };
    addEventListener("derbyo-session", onSession);
    navigator.serviceWorker?.addEventListener("message", onMessage);
    return () => { removeEventListener("derbyo-session", onSession); removeEventListener("derbyo-watch", onWatch); removeEventListener("derbyo-install", onInstall); removeEventListener("derbyo-feedback", onFeedback); removeEventListener("derbyo-return", onReturn); navigator.serviceWorker?.removeEventListener("message", onMessage); };
  }, []);
  useEffect(() => {
    if (ONLINE && /^#(invite=|friends$)/.test(location.hash)) { const h = location.hash; history.replaceState(history.state, "", location.pathname + location.search); route(h); }
  }, []);

  // A friend's Контекстно room (an accepted call, «Войти»/«Смотреть» in the friends list): straight into it.
  useEffect(() => {
    const on = (e) => { setTab(1); nav.push("contexto", { join: e.detail.code, auto: true }); };
    addEventListener("derbyo-contexto", on);
    return () => removeEventListener("derbyo-contexto", on);
  }, []);
  // The site's room link (derbyo.online/#join=123456, #watch=, #room=) reaches a phone here: join once, then forget it.
  useEffect(() => {
    // A friend's link to a Контекстно room (#ctx=123456): the game's friends tab with the code filled in.
    const ctx = ONLINE && location.hash.match(/^#ctx=(\d{6})$/);
    if (ctx) { history.replaceState(history.state, "", location.pathname + location.search); setTab(1); nav.push("contexto", { join: ctx[1] }); return; }
    const m = ONLINE && location.hash.match(/^#(join|watch|room)=(\d{6})$/);
    if (!m) return;
    history.replaceState(history.state, "", location.pathname + location.search);
    app.joinRoom(m[2], { role: m[1] === "watch" ? "spectator" : "player" });
  }, []);
  // Where the player is, for the admin's live breakdown of who is online.
  useEffect(() => setPlace(match ? (match.watching ? "grid-watch" : match.opponent?.isBot || !match.online ? "grid-bot" : "grid-match")
    : searching ? "grid-search" : tab === 0 ? "rating" : tab === 2 ? "profile" : screenPlace(stack[stack.length - 1])));
  // Playing a match yourself (on screen or minimised) blocks calling friends.
  const playing = [match, minimized].find((x) => x && x.online && !x.watching && !x.closed && !x.matchOver);
  invites.busy = !!playing;
  // The minimised match (played or watched): a friend in it gets «Вернуться» in the list instead of «Смотреть».
  invites.current = minimized && !minimized.closed ? { code: minimized.code.replace(/\s/g, ""), names: [minimized.opponent?.name, minimized.leftName].filter(Boolean) } : null;
  // Bars over the tab bar, bottom up: the minimised match, the update, then one per open call.
  const bars = match ? 0 : (minimized ? 1 : 0) + (update ? 1 : 0) + calls.length;
  return html`<div class="app" style=${bars ? `--tb-space: calc(var(--tb-bottom) + var(--tb-h) + ${12 + bars * 70}px)` : ""}>
    <${NetStrip} />
    <main class="tab-body">
      <section class="tab-pane" hidden=${tab !== 0}>${ONLINE ? html`<${RatingTab} visible=${tab === 0} />` : html`<${Placeholder} title="Рейтинг" text="Неделя и всё время, все и друзья, твоё место снизу. Следующий шаг прототипа." />`}</section>
      <section class="tab-pane" hidden=${tab !== 1}>${playTab}</section>
      <section class="tab-pane" hidden=${tab !== 2}>${ONLINE ? html`<${ProfileTab}><${InstallRow} open=${() => setInstall(true)} /><//>` : html`<${Placeholder} title="Профиль" text="Статистика, история, друзья и заявки, настройки звука, вибро и уведомлений. Следующий шаг прототипа.">
        <${InstallRow} open=${() => setInstall(true)} /><//>`}</section>
    </main>
    <div class="edge-fade" aria-hidden="true"></div>
    ${minimized && !match && (!minimized.online || minimized.state) ? html`<${ReturnBar} m=${minimized} go=${ret} drop=${dropMinimized} />` : null}
    ${update && !match ? html`<button class="return-bar update-bar glass-bar press" style=${`--i:${minimized ? 1 : 0}`} onClick=${() => updates.apply()}>
      <span class="rb-dot up"><img src=${img("sparkles")} alt="" /></span>
      <span class="rb-t"><small>Вышло обновление</small><b>${updates.text}</b></span>
      <span class="rb-go up">Обновить</span></button>` : null}
    ${!match ? calls.map((c, n) => html`<${CallBar} c=${c} i=${(minimized ? 1 : 0) + (update ? 1 : 0) + n} key=${c.id} />`) : null}
    <${TabBar} tab=${tab} pick=${pickTab} items=${[["Рейтинг", "trophy"], ["Играть", "bolt"], ["Профиль", "profile-v1", ONLINE ? ((account.ready && !account.registered) || !isStandalone() ? "!" : null) : 1]]} />
    ${searching ? html`<${Cover} class="search-cover" leaving=${searchLeaving}>${ONLINE ? html`<${OnlineSearch} done=${(r) => {
      coverClosed();
      closeSearch(r?.session ? () => open(watchClose(new OnlineMatch(r.session))) : r?.bot ? () => app.bot() : null);
    }} />` : html`<${SearchView} done=${(opp) => {
      coverClosed();
      closeSearch(opp ? () => open(new Match(opp, false)) : null);
    }} />`}<//>` : null}
    ${match ? html`<${Cover} leaving=${matchLeaving}><${MatchScreen} m=${match} key=${match.code} close=${close} minimize=${() => { coverClosed(); minimize(); }}
      findNew=${() => { close(); setTimeout(openSearch, COVER_MS); }} /><//>` : null}
    ${leaveAsk ? html`<${Alert} title="Выйти из матча?" message=${`Раунд засчитается ${minimized?.opponent.name ?? "сопернику"}.`} onClose=${() => setLeaveAsk(false)}
      actions=${[{ title: "Остаться", run: () => setLeaveAsk(false) }, { title: "Выйти", kind: "destructive", run: dropNow }]} />` : null}
    ${busy ? html`<${Alert} title="Сначала заверши матч" onClose=${() => setBusy(false)}
      message=${`Ты ещё играешь с ${minimized?.opponent.name ?? "соперником"}. Доиграй или выйди из матча — потом можно в другую комнату.`}
      actions=${[{ title: "Вернуться в матч", kind: "bold", run: () => { setBusy(false); ret(); } }, { title: "Отмена", run: () => setBusy(false) }]} />` : null}
    ${install && !match ? html`<${InstallSheet} close=${() => { setInstall(false); if (whatsNew.due()) setNews(true); }} />` : null}
    ${news && !install && !match ? html`<${WhatsNewSheet} close=${() => setNews(false)} />` : null}
    ${askPush && !install && !news && !match ? html`<${PushAskSheet} close=${() => setAskPush(false)} />` : null}
    ${invite && !match ? html`<div class="invite-toast glass" role="alert">
      <img src=${img("invite")} alt="" /><span><b>${invite.nickname}</b><small>${invite.game === "contexto" ? "зовёт в Контекстно" : "зовёт сыграть"}</small></span>
      <button class="chip-btn press accept" onClick=${() => { const i = invite; setInvite(null); takeInvite(i).catch((e) => alert(e.message)); }}>Играть</button>
      <button class="round-no press" aria-label="Скрыть" onClick=${() => setInvite(null)}><${Icon} name="x" size="14" weight="2.5" /></button></div>` : null}
    ${feedback ? html`<${FeedbackSheet} context=${feedback} close=${() => setFeedback(null)} />` : null}
    <input id="kbd-proxy" aria-hidden="true" tabindex="-1" />
  </div>`;
}

/** The bot practice uses the first level the quick game remembers. */
const QUICK_BOT_PRESET = () => { try { return JSON.parse(localStorage.getItem("quickPresets"))?.[0] ?? "amateur"; } catch { return "amateur"; } };
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

/** «Обратная связь»: a few words to the team; the room code rides along when it is sent from a match. */
function FeedbackSheet({ context, close }) {
  const [text, setText] = useState("");
  const [state, setState] = useState(null);
  const [shut, setShut] = useState(false);
  const send = async () => {
    setState("busy");
    try { const r = await sendFeedback(text.trim(), { ...context, app: "phone" }); setState({ id: r.id }); }
    catch (e) { setState({ error: e.message }); }
  };
  return html`<${Panel} shut=${shut} onClose=${close}><div class="profile feedback-sheet">
    <h3 class="sheet-title">Обратная связь</h3>
    ${state?.id ? html`<p class="hint-line pad">Спасибо! Сообщение отправлено, номер ${state.id}.</p>
      <button class="primary-btn" onClick=${() => setShut(true)}>Готово</button>`
    : html`<p class="hint-line small pad">Расскажи, что случилось или что улучшить.${context.room ? " Номер комнаты добавим сами." : ""}</p>
      <textarea class="fb-text" rows="5" maxlength="2000" placeholder="Например: не засчитало Месси за Барселону" value=${text} onInput=${(e) => setText(e.target.value)}></textarea>
      ${state?.error ? html`<p class="hint-line small pad" style="color:#FF9AA8">${state.error}</p>` : null}
      <button class="primary-btn" disabled=${state === "busy" || text.trim().length < 8} onClick=${send}>${state === "busy" ? html`<span class="spinner"></span>` : "Отправить"}</button>`}
  </div><//>`;
}

/** A call to a friend: waiting for the answer, then «Войти» once accepted; each has a minute. */
function CallBar({ c, i }) {
  const left = secondsLeft(c), accepted = c.status === "accepted";
  const go = () => takeInvite(c).catch((e) => alert(e.message)).finally(() => invites.refresh());
  const cancel = () => takeInvite(c, "cancel").catch(() => {}).finally(() => invites.refresh());
  return html`<div class=${cx("return-bar call-bar glass-bar", accepted && "accepted")} style=${`--i:${i}`}>
    <span class="rb-dot call"><svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="15" pathLength="60" style=${`stroke-dashoffset:${60 - left}`} /></svg><b>${left}</b></span>
    <span class="rb-t"><small>${accepted ? "Принял приглашение · заходи" : "Приглашение · ждём ответа"}</small><b>${c.nickname}</b></span>
    ${accepted ? html`<button class="rb-go up press" onClick=${go}>Войти</button>` : null}
    <button class="round-no press" aria-label="Отменить приглашение" onClick=${cancel}><${Icon} name="x" size="14" weight="2.5" /></button>
  </div>`;
}

/** «Вернуться в матч»: who, the score and the round, over the tab bar on every tab. */
const ReturnBar = ({ m, go, drop }) => html`<div class="return-bar glass-bar">
  <button class="rb-main press" onClick=${go}>
    <span class="rb-dot"><i></i></span>
    <span class="rb-t"><small>${m.watching ? "Ты на трибуне" : "Матч идёт"}</small>
      <b>${m.watching ? m.leftName + " — " : ""}${m.opponent.name} · ${m.score[0]}:${m.score[1]} · раунд ${m.round}</b></span>
    <span class="rb-go">Вернуться</span>
  </button>
  <button class="round-no press" aria-label=${m.watching ? "Уйти с трибуны" : "Выйти из матча"} onClick=${drop}><${Icon} name="x" size="14" weight="2.5" /></button>
</div>`;

const Placeholder = ({ title, text, children }) => html`<div class="screen-scroll"><div class="page">
  <h1 class="big-title">${title}</h1>
  <p class="placeholder">${text}</p>
  ${children}
</div></div>`;

render(html`<${App} />`, document.getElementById("root"));
startVisitPing();
