// The app shell (port of DerbyoApp.swift): tabs, the play tab's screen stack, the match and search covers,
// the bar that returns to a minimised match, and the offer to install on the home screen.
import { html, render, useState, useEffect, useReducer, useRef } from "../vendor/preact-htm.js";
import { cx, img, Icon, Alert } from "./ui/common.js";
import { has } from "./data.js";
import { Match, Opponent, store } from "./model.js";
import { MatchScreen } from "./ui/match.js";
import { HomeView, GameLobby, QuickPickView, SearchView, RoomView, JoinCodeView, LockerRoom, MatchSettingsView } from "./ui/lobby.js";
import { InstallSheet, installState, InstallRow } from "./install.js";

const SCREENS = { lobby: GameLobby, quickPick: QuickPickView, room: RoomView, code: JoinCodeView, locker: LockerRoom, settings: MatchSettingsView };
const matchDemo = ["demoBoard", "demoWin", "demoWinLater", "demoLoseLater", "demoLongMatch", "demoMix", "demoLastMove", "demoOppReview", "demoMismatch", "demoHuman", "demoFriendAsk", "demoWatch"].some(has);
const humanDemo = ["demoOppAway", "demoHuman", "demoFriendAsk", "demoWatch", "demoOppIdle", "demoOppLeaves", "demoOppPause"].some(has);

function initialStack() {
  const s = [];
  if (["demoLobby", "demoRoom", "demoSettings", "demoQuickPick", "demoLocker", "demoCode"].some(has)) s.push({ name: "lobby", props: {} });
  if (has("demoRoom") || has("demoSettings")) s.push({ name: "room", props: {} });
  if (has("demoQuickPick")) s.push({ name: "quickPick", props: {} });
  if (has("demoCode")) s.push({ name: "code", props: {} });
  if (has("demoLocker")) s.push({ name: "locker", props: { host: "Zhanbo" } });
  return s.map((x, i) => ({ ...x, key: i + 1 }));
}
let keys = 100;

function App() {
  const [, redraw] = useReducer((n) => n + 1, 0);
  const [tab, setTab] = useState(1);
  const [stack, setStack] = useState(initialStack);
  const [match, setMatch] = useState(() => (matchDemo ? new Match(humanDemo ? Opponent.human() : Opponent.bot()) : null));
  const [minimized, setMinimized] = useState(null);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [install, setInstall] = useState(() => installState.shouldOffer());
  const live = useRef({});
  /** Our own history.back() for a cover: its popstate must not also pop a screen. */
  const skipPop = useRef(false);
  live.current = { match, minimized, stack, searching };

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
  // The browser's back (Android button, Safari edge swipe) walks the play stack; in a match it minimises it.
  useEffect(() => {
    // Demo screens opened at launch get their history entries, so «Назад» stays inside the app.
    for (const _ of live.current.stack) history.pushState({}, "");
    if (live.current.match) history.pushState({ cover: true }, "");
    const f = () => {
      if (skipPop.current) { skipPop.current = false; return; }
      const l = live.current;
      if (l.match) { minimize(); return; }
      if (l.searching) { setSearching(false); return; }
      if (l.stack.length) setStack((s) => s.slice(0, -1));
    };
    addEventListener("popstate", f);
    return () => removeEventListener("popstate", f);
  }, []);

  const nav = {
    push: (name, props = {}) => { history.pushState({ d: Date.now() }, ""); setStack((s) => [...s, { name, props, key: ++keys }]); },
    back: () => history.back(),
  };
  const coverOpened = () => history.pushState({ cover: true }, "");
  const coverClosed = () => { skipPop.current = true; history.back(); };
  const open = (m) => {
    if (minimized && !minimized.watching) { setBusy(true); m.stop(); return; }
    minimized?.stop();
    setMinimized(null); setMatch(m); coverOpened();
  };
  const close = () => { match?.stop(); setMatch(null); setMinimized(null); coverClosed(); };
  const minimize = () => {
    const m = live.current.match;
    if (!m) return;
    setMinimized(m); setMatch(null);
  };
  const app = {
    open,
    quick: () => { if (minimized && !minimized.watching) setBusy(true); else { setSearching(true); coverOpened(); } },
    join: (name) => open(new Match(Opponent.human(name), false)),
    watch: (name) => open(new Match(Opponent.human(name), true)),
  };
  const ret = () => { setMatch(minimized); setMinimized(null); coverOpened(); };

  const playTab = html`<div class="stack">
    <div class=${cx("stack-screen", stack.length && "under")}><${HomeView} nav=${nav} /></div>
    ${stack.map((s, i) => {
      const S = SCREENS[s.name];
      return html`<div class=${cx("stack-screen", s.key > 100 && "pushed", i < stack.length - 1 && "under")} key=${s.key}><${S} nav=${nav} app=${app} ...${s.props} /></div>`;
    })}
  </div>`;

  return html`<div class="app">
    <main class="tab-body">
      ${tab === 1 ? playTab : tab === 0 ? html`<${Placeholder} title="Рейтинг" text="Неделя и всё время, все и друзья, твоё место снизу. Следующий шаг прототипа." />`
        : html`<${Placeholder} title="Профиль" text="Статистика, история, друзья и заявки, настройки звука, вибро и уведомлений. Следующий шаг прототипа.">
            <${InstallRow} open=${() => setInstall(true)} /><//>`}
    </main>
    ${minimized && !match ? html`<${ReturnBar} m=${minimized} go=${ret} />` : null}
    <nav class="tabbar">
      ${[["Рейтинг", "trophy"], ["Играть", "bolt"], ["Профиль", "profile-v1"]].map(([t, icon], i) => html`
        <button class=${cx("tab", tab === i && "on")} onClick=${() => setTab(i)} aria-current=${tab === i ? "page" : null}>
          <span class="tab-ic"><img src=${img(icon)} alt="" />${i === 2 ? html`<b class="badge">1</b>` : null}</span><span>${t}</span></button>`)}
    </nav>
    ${searching ? html`<${SearchView} done=${(opp) => { setSearching(false); coverClosed(); if (opp) setTimeout(() => open(new Match(opp, false)), 350); }} />` : null}
    ${match ? html`<div class="cover"><${MatchScreen} m=${match} key=${match.code} close=${close} minimize=${() => { minimize(); coverClosed(); }}
      findNew=${() => { close(); setTimeout(() => { setSearching(true); coverOpened(); }, 400); }} /></div>` : null}
    ${busy ? html`<${Alert} title="Сначала заверши матч" onClose=${() => setBusy(false)}
      message=${`Ты ещё играешь с ${minimized?.opponent.name ?? "соперником"}. Доиграй или выйди из матча — потом можно в другую комнату.`}
      actions=${[{ title: "Вернуться в матч", kind: "bold", run: () => { setBusy(false); ret(); } }, { title: "Отмена", run: () => setBusy(false) }]} />` : null}
    ${install && !match ? html`<${InstallSheet} close=${() => setInstall(false)} />` : null}
    <input id="kbd-proxy" aria-hidden="true" tabindex="-1" />
  </div>`;
}

/** «Вернуться в матч»: who, the score and the round, over the tab bar on every tab. */
const ReturnBar = ({ m, go }) => html`<button class="return-bar glass press" onClick=${go}>
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
