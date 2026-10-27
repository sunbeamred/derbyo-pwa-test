// The «Играть» tab and its screens (port of HomeView.swift, RoomViews.swift and MatchSettings.swift).
import { html, useState, useEffect, useRef, cx, img, Icon, PickMark, BottomBar, LobbyHeader, Alert, RatingTag, Panel, breakable } from "./common.js";
import { Match, Opponent, MAX_VIEWERS, store } from "../model.js";
import { has, rand } from "../data.js";
import { Sound } from "../sound.js";
import { ProfileSheet } from "./profile.js";
import { ViewerList } from "./sheets.js";

// MARK: settings (server/presets.mjs)

export const PRESETS = [
  { id: "easy", name: "Новичок", description: "Знакомые сборные и позиции", icon: "level-rookie", level: 1, tokens: 6 },
  { id: "amateur", name: "Любитель", description: "Ведущие клубы и знакомые имена", icon: "level-amateur", level: 2, tokens: 6 },
  { id: "medium", name: "Знаток", description: "Европа шире топ-лиг", icon: "level-knower", level: 3, tokens: 5 },
  { id: "hard", name: "Легенда", description: "Клубы мира и редкие сборные", icon: "level-legend", level: 4, tokens: 4 },
  { id: "encyclopedia", name: "Энциклопедия", description: "Редкие клубы, тренеры и одноклубники", icon: "expert", level: 5, tokens: 4 },
];
const LEVELS = ["Новичок", "Любитель", "Знаток", "Легенда", "Энциклопедия"];
const SECONDS = [0, 15, 20, 30, 45, 60, 90, 120];
const ROUNDS = [1, 2, 3, 5, 7];
const THEMES = [["mixed", "Разные условия"], ["clubs", "Клуб × клуб"], ["club-national", "Клуб × сборная"], ["club-position", "Клуб × позиция"],
  ["national-position", "Сборная × позиция"], ["club-league", "Клуб × чемпионат"], ["national-league", "Сборная × чемпионат"],
  ["club-history", "Клуб × трофеи, тренеры, одноклубники"], ["national-trophy", "Сборная × трофеи"]];

export const newSettings = (o = {}) => ({ preset: "amateur", level: 2, seconds: 60, tokens: 6, format: "twoWins", rounds: 3, theme: "mixed",
  progressive: false, penaltiesOnDraw: false, penaltiesEachRound: false, lastChance: false, closed: false, password: "", ...o });
const presetOf = (s) => PRESETS.find((p) => p.id === s.preset);
const passwordOK = (s) => !s.closed || s.password.length >= 4;
const roundsWord = (n) => `${n} раунд${n === 1 ? "" : n < 5 ? "а" : "ов"}`;
const fmtOf = (s) => (s.format === "twoWins" ? "до двух побед" : s.format === "tiebreak" ? "2 раунда + решающий" : roundsWord(s.rounds));
function summary(s) {
  const p = presetOf(s);
  if (p) return `${p.name} · 60 с на ход · до двух побед`;
  return `${LEVELS[s.level - 1]}${s.progressive ? " и выше" : ""} · ${s.seconds === 0 ? "без таймера" : `${s.seconds} с на ход`} · ${fmtOf(s)}`;
}
function settingRows(s) {
  const p = presetOf(s);
  const out = [
    ["Сложность", p?.name ?? LEVELS[s.level - 1] + (s.progressive ? " и выше каждый раунд" : "")],
    ["На ход", p ? "60 секунд" : s.seconds === 0 ? "без таймера" : `${s.seconds} секунд`],
    ["Жетонов скаута", `${p?.tokens ?? s.tokens} на раунд`],
    ["Формат", p ? "до двух побед" : fmtOf(s)],
    ["Условия поля", p ? "Разные условия" : THEMES.find((t) => t[0] === s.theme)?.[1] ?? s.theme],
  ];
  if (s.penaltiesOnDraw) out.push(["Пенальти", s.penaltiesEachRound ? "в каждом раунде" : "при ничьей в матче"]);
  if (s.lastChance && s.penaltiesOnDraw) out.push(["Последний шанс", "включён"]);
  out.push(["Доступ", s.closed ? "🔒 по паролю" : "открытая"]);
  return out;
}
function extras(s) {
  const parts = [];
  if (s.progressive && !presetOf(s)) parts.push("сложность растёт");
  if (s.penaltiesOnDraw) parts.push(s.penaltiesEachRound ? "Пенальти в каждом раунде" : "Пенальти при ничьей");
  if (s.lastChance && s.penaltiesOnDraw) parts.push("Последний шанс");
  return parts.join(" · ");
}

/** The quick game's choice of levels, kept on the phone when the player asks to remember it. */
export const QuickChoice = {
  get presets() { try { return JSON.parse(localStorage.getItem("quickPresets")) ?? ["amateur", "medium"]; } catch { return ["amateur", "medium"]; } },
  set presets(v) { try { localStorage.setItem("quickPresets", JSON.stringify(v)); } catch {} },
  get remember() { try { return localStorage.getItem("quickRemember") === "1"; } catch { return false; } },
  set remember(v) { try { localStorage.setItem("quickRemember", v ? "1" : "0"); } catch {} },
  get summary() { const c = QuickChoice.presets; return PRESETS.filter((p) => c.includes(p.id)).map((p) => p.name).join(" · "); },
};

const Section = ({ t }) => html`<h4 class="section">${t}</h4>`;

// MARK: home

/** The «Играть» tab: DERBYO as a collection of games; each game is one card with one «Играть». */
export function HomeView({ nav }) {
  const [sound, setSound] = useState(Sound.enabled);
  return html`<div class="screen-scroll"><div class="page">
    <div class="home-head">
      <b class="logo">DERBYO</b><span class="sp"></span>
      <button class="sound-btn glass press" aria-label=${sound ? "Выключить звук" : "Включить звук"}
        onClick=${() => { Sound.enabled = !sound; setSound(!sound); Sound.play("turn"); }}>
        <img src=${img("sound")} alt="" class=${sound ? "" : "off"} />${sound ? null : html`<i class="slash"></i>`}</button>
      <span class="online-pill"><i></i>41 онлайн</span>
    </div>
    <${Section} t="ИГРЫ" />
    <div class="game-card">
      <img class="hero" src="img/hero.jpg" alt="" />
      <div class="gc-in">
        <h2>Футбольные<br />крестики-нолики</h2>
        <p><i></i>Дуэли онлайн · 26 играют сейчас</p>
        <button class="primary-btn" onClick=${() => nav.push("lobby")}><img src=${img("bolt")} alt="" />Играть</button>
      </div>
    </div>
    <div class="soon">
      <span class="soon-ic"><${Icon} name="sparkles" size="18" weight="1.8" /></span>
      <span><b>Новые игры скоро</b><small>Футбольные викторины и дуэли — в одном приложении</small></span>
    </div>
  </div></div>`;
}

const ROOMS = [
  { name: "Эмир", level: "Знаток", state: "В игре · раунд 2", open: false, locked: false },
  { name: "Zhanbo", level: "Любитель", state: "Ждёт игрока", open: true, locked: true },
  { name: "хабиб дарит", level: "Любитель", state: "В игре · раунд 1", open: false, locked: true },
  { name: "Альмира", level: "Новичок", state: "Ждёт игрока", open: true, locked: false },
];

/** One game's screen: online (quick game, with a friend) or offline (bot, one phone), and open rooms. */
export function GameLobby({ nav, app }) {
  const [locked, setLocked] = useState(null);
  const remembered = QuickChoice.remember;
  const mode = (icon, title, detail, run) => html`<button class=${cx("mode press", !run && "soon-mode")} disabled=${!run} onClick=${run}>
    <span class="mode-ic">${icon ? html`<img src=${img(icon)} alt="" />` : html`<${Icon} name="phone" size="18" weight="1.8" />`}</span>
    <span class="mode-t"><b>${title}</b><small>${detail}</small></span>
    ${run ? html`<${Icon} name="right" size="13" weight="3" class="chev" />` : null}</button>`;
  return html`<div class="screen-scroll"><div class="page">
    <${LobbyHeader} title="Футбольные крестики-нолики" back=${nav.back} />
    <${Section} t="ОНЛАЙН" />
    <button class="primary-btn" onClick=${() => (remembered && QuickChoice.presets.length ? app.quick() : nav.push("quickPick"))}><img src=${img("bolt")} alt="" />Быстрая игра</button>
    ${remembered ? html`<button class="remembered" onClick=${() => nav.push("quickPick")}>${QuickChoice.summary}<b>  ·  изменить</b></button>` : null}
    <div class="two">
      <button class="navy-btn tall" onClick=${() => nav.push("room")}><img src=${img("invite")} alt="" />Создать</button>
      <button class="mint-btn tall press" onClick=${() => nav.push("code")}><img src=${img("arrow")} alt="" />По коду</button>
    </div>
    <${Section} t="ОФЛАЙН" />
    ${mode("bot", "С ботом", "Тренировка, без рейтинга", () => app.open(new Match(Opponent.bot(), false)))}
    ${mode(null, "На одном телефоне", "Скоро", null)}
    <${Section} t="ОТКРЫТЫЕ КОМНАТЫ" />
    <div class="rooms glass">${ROOMS.map((r) => html`<div class="room-row">
      <span class="sq-av">${r.name.slice(0, 2).toUpperCase()}</span>
      <span class="rr-t"><b>${r.name}${r.locked ? html` <${Icon} name="lock" size="11" style="color:#F6D482" />` : null}</b><small>${r.level} · ${r.state}</small></span>
      ${r.open ? html`<button class="join-btn press" onClick=${() => (r.locked ? setLocked({ name: r.name, watch: false }) : nav.push("locker", { host: r.name }))}>Войти</button>`
        : html`<button class="navy-btn small watch" onClick=${() => (r.locked ? setLocked({ name: r.name, watch: true }) : app.watch(r.name))}>Смотреть</button>`}
    </div>`)}</div>
  </div>
  ${locked ? html`<${RoomPassword} room=${`Комната ${locked.name}`} cancel=${() => setLocked(null)}
    enter=${() => { const l = locked; setLocked(null); l.watch ? app.watch(l.name) : nav.push("locker", { host: l.name }); }} />` : null}
  </div>`;
}

/** The password prompt of a closed room; in the prototype the password is 1234. */
function RoomPassword({ room, enter, cancel }) {
  const [pw, setPw] = useState("");
  const [wrong, setWrong] = useState(false);
  const ref = useRef();
  useEffect(() => ref.current?.focus(), [wrong]);
  const go = () => { if (pw === "1234") enter(); else { setPw(""); setWrong(true); } };
  return html`<${Alert} title=${wrong ? "Неверный пароль" : "🔒 Закрытая комната"} onClose=${cancel}
    message=${wrong ? "Попробуй ещё раз. Пароль знает создатель комнаты." : `${room} закрыта. Введи пароль, чтобы войти.`}
    actions=${[{ title: "Отмена", run: cancel }, { title: "Войти", kind: "bold", run: go }]}>
    <input ref=${ref} class="alert-input" type="password" placeholder="Пароль" value=${pw} onInput=${(e) => setPw(e.target.value)}
      onKeyDown=${(e) => e.key === "Enter" && go()} />
  <//>`;
}

// MARK: quick game

export function QuickPickView({ nav, app }) {
  const [chosen, setChosen] = useState(new Set(QuickChoice.presets));
  const [remember, setRemember] = useState(QuickChoice.remember);
  const level = (p) => {
    const enc = p.id === "encyclopedia", lockedEnc = enc && !chosen.has("hard"), on = chosen.has(p.id) && !lockedEnc;
    const flip = () => {
      const c = new Set(chosen);
      on ? c.delete(p.id) : c.add(p.id);
      if (p.id === "hard" && !c.has("hard")) c.delete("encyclopedia");
      setChosen(c);
    };
    return html`<button class=${cx("pick-card press", on && "on")} disabled=${lockedEnc} onClick=${flip}>
      <img src=${img(p.icon)} alt="" /><span class="pc-t"><b>${p.name}</b>
      <small>${enc ? (lockedEnc ? "только вместе с Легендой" : "решающий раунд") : `${p.description} · ${p.tokens} ${p.tokens === 4 ? "жетона" : "жетонов"}`}</small></span>
      <${PickMark} on=${on} /></button>`;
  };
  return html`<div class="screen-with-bar"><div class="screen-scroll"><div class="page">
    <${LobbyHeader} title="Быстрая игра" back=${nav.back} />
    <p class="lead-text">Выбери сложности — найдём соперника.</p>
    <${Section} t="ПОДХОДЯЩИЕ СЛОЖНОСТИ" />
    ${PRESETS.map(level)}
    <p class="hint-line small pad">Время вне игры за матч: «Новичок» и «Любитель» — 45 с, «Знаток» — 35 с, «Легенда» — 30 с, «Энциклопедия» — 25 с. Звонки и уведомления тоже считаются.</p>
    <p class="center-note">От простого к сложному · 60 секунд на ход</p>
  </div></div>
  <${BottomBar}>
    <button class="remember" onClick=${() => setRemember(!remember)}><${PickMark} on=${remember} size=${22} />
      <span><b>Запомнить выбор</b><small>В следующий раз «Быстрая игра» сразу начнёт поиск</small></span></button>
    <button class="primary-btn" disabled=${!chosen.size} onClick=${() => {
      QuickChoice.presets = PRESETS.map((p) => p.id).filter((id) => chosen.has(id));
      QuickChoice.remember = remember;
      nav.back(); app.quick();
    }}><img src=${img("bolt")} alt="" />Найти соперника</button>
  <//></div>`;
}

/** The search for an opponent: six seconds, then tima_kz; from three seconds the bot is offered. */
export function SearchView({ done }) {
  const [s, setS] = useState(0);
  const [found, setFound] = useState(false);
  useEffect(() => {
    let n = 0;
    const t = setInterval(() => {
      n++; setS(n);
      if (n >= 6) { clearInterval(t); setFound(true); setTimeout(() => done(Opponent.human()), 900); }
    }, 1000);
    return () => clearInterval(t);
  }, []);
  const C = 2 * Math.PI * 85;
  const lvl = PRESETS.find((p) => QuickChoice.presets.includes(p.id))?.name ?? "Любитель";
  return html`<div class="search cover">
    <div class="search-head"><button class="text-btn red" onClick=${() => done(null)}>Отмена</button><b>Быстрая игра</b><span style="width:60px"></span></div>
    <div class="search-mid">
      <span class="search-ring"><svg viewBox="0 0 180 180"><circle cx="90" cy="90" r="85" fill="none" stroke="#17283A" stroke-width="10" />
        <circle class="arc slow" cx="90" cy="90" r="85" fill="none" stroke="#FF5364" stroke-width="10" stroke-linecap="round" stroke-dasharray=${C}
          stroke-dashoffset=${C * (1 - Math.min(1, s / 6))} transform="rotate(-90 90 90)" /></svg>
        <span><b>0:${String(s).padStart(2, "0")}</b><small>${found ? "найден" : "ищем"}</small></span></span>
      <h2>${found ? "Соперник найден" : "Ищем соперника…"}</h2>
      <p>${found ? `tima_kz · ${lvl}` : `${QuickChoice.summary} · 38 игроков в поиске`}</p>
      ${s >= 3 && !found ? html`<button class="navy-btn fade-in" onClick=${() => done(Opponent.bot())}><img src=${img("bot")} alt="" />Пока никого — играть с ботом</button>` : null}
    </div>
    <p class="search-foot">Можно свернуть приложение: когда соперник найдётся, придёт уведомление.</p>
  </div>`;
}

// MARK: rooms

/** People's profiles in a room come from a match model that never plays. */
const roomModel = (host) => { const r = new Match(Opponent.human(host), false); r.stop(); return r; };

/** A player's card in a room: avatar in the mark colour (a mint ring once ready), name, rating, status pill. */
function SeatCard({ name, red, ready, gone = false, note = "", flag, rating, place, open }) {
  return html`<button class="seat press" onClick=${open} aria-label=${`${name}, открыть профиль`}>
    <span class=${cx("seat-av", red ? "red" : "green", ready && "ready", gone && "gone")}><span>${name.slice(0, 2).toUpperCase()}</span></span>
    <b class="seat-name">${breakable(name)}</b>
    <${RatingTag} flag=${flag} rating=${rating} rank=${place} small=${10} />
    <span class=${cx("status-pill", gone ? "gone" : ready ? "ready" : "")}><i></i>${gone ? note : ready ? "Готов" : "Не готов"}</span>
  </button>`;
}

function ProfilePanel({ target, room, close }) {
  return html`<${Panel} onClose=${close}>${(leave) => html`<${ProfileSheet} m=${room} owner=${target.owner} viewer=${target.viewer} close=${leave} />`}<//>`;
}

/** «Создать»: your room. One code for everyone; the friend arrives a few seconds in (test data). */
export function RoomView({ nav, app }) {
  const [code] = useState(() => `${Math.floor(rand(100, 1000))} ${String(Math.floor(rand(0, 1000))).padStart(3, "0")}`);
  const [copied, setCopied] = useState(false);
  const [settings, setSettings] = useState(newSettings());
  const [room] = useState(() => roomModel("tima_kz"));
  const [profile, setProfile] = useState(null);
  const [friend, setFriend] = useState(null);
  useEffect(() => { const t = setTimeout(() => { setFriend("tima_kz"); Sound.play("turn"); }, 5000); return () => clearTimeout(t); }, []);
  useEffect(() => { if (has("demoSettings")) nav.push("settings", { settings, set: setSettings }); }, []);
  const text = `Сыграем в DERBYO? Комната ${code}: derbyo.online/r/${code.replace(" ", "")}`;
  const share = async () => { try { if (navigator.share) await navigator.share({ text }); else { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); } } catch {} };
  const copy = async () => { try { await navigator.clipboard.writeText(code.replace(" ", "")); } catch {} setCopied(true); setTimeout(() => setCopied(false), 1500); };
  const ex = [extras(settings), settings.closed ? "🔒 по паролю" : ""].filter(Boolean).join(" · ");
  const p = presetOf(settings);
  return html`<div class="screen-with-bar"><div class="screen-scroll"><div class="page">
    <${LobbyHeader} title="Комната" back=${nav.back} />
    <div class="code-card glass">
      <small class="cap">КОД КОМНАТЫ</small>
      <b class="room-code">${code}</b>
      <div class="two">
        <button class="primary-btn" onClick=${share}><${Icon} name="share" size="17" />Поделиться</button>
        <button class="navy-btn tall code-copy" onClick=${copy}><${Icon} name=${copied ? "check" : "copy"} size="16" />${copied ? "Скопирован" : "Код"}</button>
      </div>
      <p class="hint-line small center">Отправь ссылку или код другу. Код общий: третий и дальше попадут на трибуну.</p>
    </div>
    <div class="seats">
      <${SeatCard} name=${room.myName} red=${room.seat(0) === 0} ready=${true} flag=${room.myFlag} rating=${room.myRating} place=${room.myRank} open=${() => setProfile({ owner: 0 })} />
      <b class="vs">vs</b>
      ${friend ? html`<${SeatCard} name=${friend} red=${room.seat(1) === 0} ready=${true} flag=${room.opponent.flag} rating=${room.opponent.rating} place=${room.opponent.rank} open=${() => setProfile({ owner: 1 })} />`
        : html`<div class="seat-wait"><span class="pulse-av"><i></i><${Icon} name="question" size="20" weight="2" /></span><b>Ждём друга…</b><small>место свободно</small></div>`}
    </div>
    <button class="settings-card press" onClick=${() => nav.push("settings", { settings, set: setSettings })}>
      <img src=${img(p?.icon ?? "settings")} alt="" />
      <span><small>Настройки матча</small><b>${summary(settings)}</b>${ex ? html`<em>${ex}</em>` : null}</span>
      <${Icon} name="right" size="13" weight="3" class="chev" />
    </button>
  </div></div>
  <${BottomBar}><button class="primary-btn" disabled=${!friend || !passwordOK(settings)} onClick=${() => friend && app.join(friend)}>
    ${!passwordOK(settings) ? "Задай пароль от 4 символов" : !friend ? "Ждём второго игрока" : "Начать матч"}</button><//>
  ${profile ? html`<${ProfilePanel} target=${profile} room=${room} close=${() => setProfile(null)} />` : null}
  </div>`;
}

/** «По коду»: six digits in boxes, the number pad up at once; «Войти» once all six are in. */
export function JoinCodeView({ nav }) {
  const [digits, setDigits] = useState("");
  const [focused, setFocused] = useState(false);
  const [askPw, setAskPw] = useState(false);
  const ref = useRef();
  useEffect(() => { ref.current?.focus(); }, []);
  const paste = async () => { try { const t = await navigator.clipboard.readText(); setDigits(t.replace(/\D/g, "").slice(0, 6)); } catch {} };
  const enter = () => (digits.startsWith("9") ? setAskPw(true) : nav.push("locker", { host: "Zhanbo" }));
  return html`<div class="screen-with-bar"><div class="screen-scroll"><div class="page">
    <${LobbyHeader} title="Войти по коду" back=${nav.back} />
    <p class="lead-text">Введи 6 цифр, которые прислал друг</p>
    <label class="code-boxes">
      <input ref=${ref} inputmode="numeric" autocomplete="one-time-code" value=${digits} onFocus=${() => setFocused(true)} onBlur=${() => setFocused(false)}
        onInput=${(e) => { const v = e.target.value.replace(/\D/g, "").slice(0, 6); e.target.value = v; setDigits(v); }} aria-label="Код комнаты" />
      ${[0, 1, 2, 3, 4, 5].map((i) => html`${i === 3 ? html`<i class="dash">–</i>` : null}<span class=${cx("box", i === digits.length && focused && "cur")}>${digits[i] ?? ""}</span>`)}
    </label>
    <button class="text-btn muted" onClick=${paste}><${Icon} name="paste" size="15" />Вставить из буфера</button>
  </div></div>
  <${BottomBar}>
    <button class="primary-btn" disabled=${digits.length < 6} onClick=${enter}>Войти</button>
    <p class="hint-line small center">Если оба места заняты, ты попадёшь на трибуну и будешь смотреть матч.</p>
  <//>
  ${askPw ? html`<${RoomPassword} room=${`Комната ${digits.slice(0, 3)} ${digits.slice(3)}`} cancel=${() => setAskPw(false)} enter=${() => { setAskPw(false); nav.push("locker", { host: "Zhanbo" }); }} />` : null}
  </div>`;
}

/** A card with a tappable header that folds its content away; folded, it shows a one-line summary. */
function Collapsible({ title, summary: sum, open, toggle, children }) {
  return html`<div class="collapsible glass">
    <button class="col-head-btn" onClick=${toggle} aria-expanded=${open}>
      <span><small class="cap">${title}</small>${!open && sum ? html`<b>${sum}</b>` : null}</span>
      <${Icon} name="down" size="13" weight="3" class=${cx("chev", open && "flip")} />
    </button>
    ${open ? html`<div class="col-body">${children}</div>` : null}
  </div>`;
}

/** «Раздевалка»: you took the free seat of someone's room; the match starts when both pressed «Я готов». */
export function LockerRoom({ nav, app, host }) {
  const [settings] = useState(() => newSettings({ preset: null, level: 2, progressive: true, seconds: 45, tokens: 5, penaltiesOnDraw: true, closed: true, password: "1234" }));
  const [chat, setChat] = useState([{ who: host, text: "Привет! Сейчас подойду", spectator: false }, { who: "alex_99", text: "Жду этот матч 🔥", spectator: true }]);
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState({ settings: true, chat: true, stands: false });
  const [profile, setProfile] = useState(null);
  const [room] = useState(() => roomModel(host));
  const [meReady, setMeReady] = useState(false);
  const [hostReady, setHostReady] = useState(false);
  const [hostGone, setHostGone] = useState(false);
  const timeout = has("demoHostAway") ? 12 : 60;
  const [left, setLeft] = useState(timeout);
  const viewers = ["alex_99", "nurik"];
  useEffect(() => {
    if (!meReady || hostReady || hostGone) return;
    const t = setInterval(() => setLeft((l) => { if (l <= 1) { setHostGone(true); return 0; } return l - 1; }), 1000);
    return () => clearInterval(t);
  }, [meReady, hostReady, hostGone]);
  const flip = (k) => setOpen({ ...open, [k]: !open[k] });
  const send = (e) => { e.preventDefault(); const t = draft.trim(); if (!t) return; setChat([...chat, { who: "Ты", text: t, spectator: false }]); setDraft(""); };
  const ready = () => {
    setMeReady(true);
    if (has("demoHostAway")) return;
    setTimeout(() => { setHostReady(true); setTimeout(() => app.join(host), 800); }, 2000);
  };
  const last = chat[chat.length - 1];
  return html`<div class="screen-with-bar"><div class="screen-scroll"><div class="page">
    <${LobbyHeader} title=${`Комната ${host}`} back=${nav.back} />
    <div class="locker-title"><small class="cap gold">РАЗДЕВАЛКА</small><h2>${hostGone ? "Создатель комнаты ушёл" : "Оба на месте. Пора играть."}</h2></div>
    <div class="seats">
      <${SeatCard} name=${host} red=${room.seat(1) === 0} ready=${hostReady} gone=${hostGone} note="не подтвердил готовность"
        flag=${room.opponent.flag} rating=${room.opponent.rating} place=${room.opponent.rank} open=${() => setProfile({ owner: 1 })} />
      <b class="vs">vs</b>
      <${SeatCard} name=${room.myName} red=${room.seat(0) === 0} ready=${meReady} flag=${room.myFlag} rating=${room.myRating} place=${room.myRank} open=${() => setProfile({ owner: 0 })} />
    </div>
    <${Collapsible} title="НАСТРОЙКИ МАТЧА" summary=${summary(settings)} open=${open.settings} toggle=${() => flip("settings")}>
      <div class="set-rows">${settingRows(settings).map(([k, v]) => html`<div><span>${k}</span><b>${v}</b></div>`)}</div>
    <//>
    <${Collapsible} title="ЧАТ КОМНАТЫ" summary=${last ? `${last.who}: ${last.text}` : ""} open=${open.chat} toggle=${() => flip("chat")}>
      <div class="chat-list inline">${chat.map((x) => html`<div class=${cx("msg", x.who === "Ты" && "me", x.spectator && "spec")}>
        <button class="who" disabled=${x.who === "Ты"} onClick=${() => setProfile(x.spectator ? { owner: 1, viewer: x.who } : { owner: 1 })}>
          <span class=${x.who !== "Ты" ? "u" : ""}>${x.who}</span>${x.spectator ? html`<i> · зритель</i>` : null}</button>
        <span class="text">${x.text}</span></div>`)}</div>
      <form class="mini-field" onSubmit=${send} action="#">
        <input value=${draft} onInput=${(e) => setDraft(e.target.value)} placeholder="Напиши сообщение" enterkeyhint="send" autocomplete="off" />
        <button type="submit" class=${cx("send", draft.trim() && "on")} disabled=${!draft.trim()} aria-label="Отправить"><${Icon} name="up" size="16" weight="3" /></button>
      </form>
    <//>
    <${Collapsible} title=${`ТРИБУНА · ${viewers.length} / ${MAX_VIEWERS}`} summary=${viewers.join(", ")} open=${open.stands} toggle=${() => flip("stands")}>
      <${ViewerList} viewers=${viewers} open=${(v) => setProfile({ owner: 1, viewer: v })} />
    <//>
    <p class="hint-line small">Первый ход — ×. В реванше начинает другой игрок. Подсказки и поле общие для всех подключившихся.</p>
  </div></div>
  <${BottomBar}>
    ${hostGone ? html`<button class="primary-btn" onClick=${nav.back}>К списку комнат</button>`
      : meReady ? html`<div class="waiting-bar"><span class="spinner muted"></span><span><b>Готов. Ждём ${host}…</b><small>если не подтвердит за ${left} с — выйдет из комнаты</small></span></div>`
      : html`<button class="primary-btn" onClick=${ready}>Я готов — начать матч</button>`}
  <//>
  ${profile ? html`<${ProfilePanel} target=${profile} room=${room} close=${() => setProfile(null)} />` : null}
  </div>`;
}

/** The settings of a room you created: ready levels as cards, or a manual setup; then extras and access. */
export function MatchSettingsView({ nav, settings: initial, set }) {
  const [s, setS] = useState(initial);
  const [manual, setManual] = useState(initial.preset === null);
  const upd = (o) => { const n = { ...s, ...o }; setS(n); set(n); };
  const flipManual = () => {
    if (manual && s.preset === null) upd({ preset: PRESETS[s.level - 1].id });
    if (!manual) { const p = presetOf(s); if (p) upd({ level: p.level, tokens: p.tokens, preset: null }); }
    setManual(!manual);
  };
  const select = (title, key, options, label) => html`<label class="picker-row"><span>${title}</span>
    <span class="picker"><b>${label(s[key])}</b><${Icon} name="down" size="11" weight="3" />
      <select value=${String(s[key])} onChange=${(e) => { const v = options.find((o) => String(o) === e.target.value); upd({ [key]: v }); }}>
        ${options.map((o) => html`<option value=${String(o)}>${label(o)}</option>`)}</select></span></label>`;
  const toggle = (key, icon, title, detail) => html`<label class="toggle-card">
    <span class="tc-ic"><${Icon} name=${icon} size="18" weight="2" /></span>
    <span class="tc-t"><b>${title}</b><small>${detail}</small></span>
    <input type="checkbox" class="switch" checked=${s[key]} onChange=${(e) => upd({ [key]: e.target.checked })} /></label>`;
  const seg = (key, a, b) => html`<div class="segmented">
    <button class=${!s[key] ? "on" : ""} onClick=${() => upd({ [key]: false })}>${a}</button>
    <button class=${s[key] ? "on" : ""} onClick=${() => upd({ [key]: true })}>${b}</button></div>`;
  return html`<div class="screen-scroll"><div class="page">
    <${LobbyHeader} title="Настройки матча" back=${nav.back} />
    <div class="set-head"><small class="cap">${manual ? "РУЧНАЯ НАСТРОЙКА" : "СЛОЖНОСТЬ"}</small>
      <button class="chip-btn press" onClick=${flipManual}><img src=${img("settings")} alt="" />${manual ? "Готовые уровни" : "Настроить вручную"}</button></div>
    ${manual ? html`<div class="manual glass">
      ${select(s.progressive ? "Начальная сложность" : "Сложность", "level", [1, 2, 3, 4, 5], (l) => LEVELS[l - 1])}
      <label class="picker-row"><span><span>Усложнять каждый раунд</span><small>Новичок → Любитель → Знаток → Легенда</small></span>
        <input type="checkbox" class="switch" checked=${s.progressive} onChange=${(e) => upd({ progressive: e.target.checked })} /></label>
      ${select("На ход", "seconds", SECONDS, (x) => (x === 0 ? "Без таймера" : `${x} секунд`))}
      ${select("Жетонов на раунд", "tokens", [0, 1, 2, 3, 4, 5, 6, 7, 8], String)}
      ${select("Формат", "format", ["twoWins", "rounds", "tiebreak"], (f) => ({ twoWins: "До двух побед", rounds: "Число раундов", tiebreak: "2 раунда + решающий" })[f])}
      ${s.format === "rounds" ? select("Раундов", "rounds", ROUNDS, String) : null}
      ${select("Условия поля", "theme", THEMES.map((t) => t[0]), (id) => THEMES.find((t) => t[0] === id)?.[1] ?? id)}
    </div>` : html`${PRESETS.map((p) => html`<button class=${cx("pick-card press", s.preset === p.id && "on")} onClick=${() => upd({ preset: p.id })}>
        <img src=${img(p.icon)} alt="" /><span class="pc-t"><b>${p.name}</b><small>${p.description}</small></span>
        <span class="cost"><img src=${img("coin")} alt="" /><b>${p.tokens}</b></span><${PickMark} on=${s.preset === p.id} round=${true} /></button>`)}
      <p class="hint-line small pad">60 секунд на ход · до двух побед. Время вне игры за матч: «Новичок» и «Любитель» — 45 с, «Знаток» — 35 с, «Легенда» — 30 с, «Энциклопедия» — 25 с.</p>`}
    <${Section} t="ДОПОЛНИТЕЛЬНО" />
    ${toggle("penaltiesOnDraw", "ball", "Пенальти при ничьей", "При равном счёте — серия ударов")}
    ${s.penaltiesOnDraw ? html`${seg("penaltiesEachRound", "В конце матча", "В каждом раунде")}
      ${toggle("lastChance", "timer", "Последний шанс", "Второй игрок может спасти раунд ответной тройкой за 20 секунд")}` : null}
    <${Section} t="ДОСТУП В КОМНАТУ" />
    ${seg("closed", "Открытая", "🔒 Закрытая")}
    ${s.closed ? html`<label class=${cx("pw-field", !passwordOK(s) && "bad")}><${Icon} name="lock" size="16" style="color:#F6D482" />
      <input type="password" placeholder="Пароль · минимум 4 символа" value=${s.password} autocomplete="new-password" onInput=${(e) => upd({ password: e.target.value })} /></label>` : null}
    <p class="hint-line small pad">${s.closed ? "Видна в списке комнат с замком. Войти можно только с паролем — и игроку, и зрителю." : "Видна в списке комнат. Любой может присоединиться или смотреть."}</p>
  </div></div>`;
}
