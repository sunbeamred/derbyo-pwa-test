// The «Играть» screens on the site's server: open rooms, the quick game's search, your room, joining by code,
// someone's room before the start. Same look as the offline prototype's (lobby.js), real data underneath.
import { html, useState, useEffect, useRef, cx, img, Icon, BottomBar, LobbyHeader, Panel, RatingTag } from "./common.js";
import { PRESETS, LEVELS, QuickChoice, Section, RoomPassword, Collapsible, summary, settingRows, extras, passwordOK, newSettings, presetOf, presetsOf } from "./lobby.js";
import { ViewerList } from "./sheets.js";
import { ProfileSheet } from "./profile.js";
import { Face } from "./account.js";
import { openRooms, quick, createRoom, account } from "../net.js";
import { OnlineMatch } from "../online.js";

/** The settings screen's choices as the site's create/settings body. */
export function createBody(s) {
  const p = presetOf(s), ids = presetsOf(s).map((x) => x.id);
  // Several levels: the sandbox plays them round by round; the site takes the first.
  const body = p ? { preset: ids[0] ?? p.id, ...(ids.length > 1 ? { presets: ids } : {}) } : {
    level: s.level, seconds: s.seconds, tokens: s.tokens, progressive: s.progressive, theme: s.theme,
    winsRequired: s.format === "twoWins" ? 2 : undefined, tiebreak: s.format === "tiebreak", rounds: s.format === "rounds" ? s.rounds : 3,
  };
  return { ...body, penaltiesOnDraw: false, lastChance: false, ...(s.coaches === false ? { coaches: false } : {}), ...(s.teammates === false ? { teammates: false } : {}), ...(s.awayTimer === false ? { awayTimer: false } : {}),
    accessType: s.closed ? "closed" : "open", ...(s.closed ? { password: s.password } : {}) };
}
/** The site's room settings in the settings screen's shape (for the summary and the rows). */
export function fromServer(x = {}, locked = false) {
  const presets = Array.isArray(x.roundPresets) ? [...new Set(x.roundPresets)] : [];
  const preset = presets[0] ?? (PRESETS.some((p) => p.id === x.id) ? x.id : null);
  return newSettings({ preset, presets: preset ? (presets.length ? presets : [preset]) : [], level: x.level ?? 2, seconds: x.seconds ?? 60, tokens: x.tokens ?? 4, theme: x.theme ?? "mixed", progressive: !!x.progressive,
    format: x.winsRequired === 2 ? "twoWins" : x.tiebreak ? "tiebreak" : "rounds", rounds: x.rounds ?? 3,
    penaltiesOnDraw: !!x.penaltiesOnDraw, penaltiesEachRound: x.penaltiesScope === "round", lastChance: !!x.lastChance, closed: locked, password: locked ? "••••" : "", coaches: x.coaches !== false, teammates: x.teammates !== false, awayTimer: x.awayTimer !== false });
}

const STAGE = { lobby: "Ждёт игрока", playing: "В игре", paused: "Пауза", between: "Перерыв", complete: "Завершён" };

const TINT = { 1: "#C9D5E3", 2: "#6FA8FF", 3: "#FFE45C", 4: "#FF7A3D", 5: "#B194FF" };

/** An open room as a match poster: both seats face each other; a free seat is the join button, a running match opens to watch. */
function RoomTile({ r, enter }) {
  const lv = PRESETS.find((p) => p.level === (r.level ?? 2)) ?? PRESETS[1];
  const pens = r.mode === "penalties";
  const join = r.openSeats > 0 && r.stage === "lobby";
  const watch = !join && r.canWatch;
  const players = r.players?.length ? r.players : [{ name: r.host ?? "Игрок" }, null];
  const seat = (p, side) => (p ? html`<span class=${cx("rt-seat", side)}>${p.bot ? html`<span class="pf-avatar neutral mini"><img src=${img("bot")} alt="" /></span>` : html`<${Face} name=${p.name} photo=${p.avatar} small=${true} />`}<b>${p.name}</b></span>`
    : html`<span class=${cx("rt-seat free", side, join && "open")}><span class="rt-plus">+</span><b>${join ? "Сесть" : "свободно"}</b></span>`);
  return html`<button class=${cx("room-tile press", join && "joinable")} style=${`--tint:${pens ? "#FF5364" : TINT[lv.level]}`} disabled=${!join && !watch}
    onClick=${() => (join || watch) && enter(r, !join)}>
    <span class="rt-top">
      <img class="rt-level" src=${img(pens ? "whistle" : lv.icon)} alt="" />
      <b class="rt-name">${pens ? "Пенальти" : lv.name}</b>
      ${r.round ? html`<small class="rt-meta">раунд ${r.round}</small>` : null}
      <small class=${cx("rt-state", r.stage === "playing" && "live", join && "wait")}><i></i>${STAGE[r.stage] ?? r.stage}</small>
      <span class="rt-flex"></span>
      ${r.locked && !watch ? html`<img class="rt-lock" src=${img("lock")} alt="С паролем" />` : null}
      ${watch ? html`<span class="rt-watch" aria-label=${(r.locked ? "С паролем. " : "") + (r.viewers ? `Смотреть, зрителей: ${r.viewers}` : "Смотреть")}><${Icon} name="eye" size="15" />${r.viewers ? html`<b>${r.viewers}</b>` : null}${r.locked ? html`<img class="rt-watch-lock" src=${img("lock")} alt="" />` : null}</span>` : null}
    </span>
    <span class="rt-players">${seat(players[0], "l")}<i class="rt-vs">VS</i>${seat(players[1], "r")}</span>
  </button>`;
}

/** One game's screen with the site's open rooms (refreshed every 10 s). */
export function OnlineLobby({ nav, app }) {
  const [rooms, setRooms] = useState(null);
  const [locked, setLocked] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    let live = true;
    const load = () => openRooms().then((r) => { if (live) { setRooms(r); setErr(null); } }).catch((e) => live && setErr(e.message));
    load();
    const t = setInterval(load, 10000);
    return () => { live = false; clearInterval(t); };
  }, []);
  // One phone needs the sandbox server (it seats «Игрок 2»); the site shows it as coming soon.
  const hotseat = !!account.profile && "showFlag" in account.profile;
  // Bot and one-phone games take the same settings as a room.
  const practice = (kind) => nav.push("settings", { settings: newSettings(), kind,
    start: (s) => { nav.back(); return kind === "bot" ? app.bot(createBody(s)) : app.hotseat(createBody(s)); } });
  // A sandbox admin (tester1) watches any room unseen, a locked one too, without the password.
  const enter = (r, watch) => (r.locked && !(watch && account.profile?.admin) ? setLocked({ r, watch }) : app.joinRoom(r.code, { role: watch ? "spectator" : "player" }));
  const mode = (icon, title, detail, run) => html`<button class=${cx("mode flat press", !run && "soon-mode")} disabled=${!run} onClick=${run}>
    <span class="mode-ic">${icon ? html`<img src=${img(icon)} alt="" />` : html`<${Icon} name="phone" size="18" weight="1.8" />`}</span>
    <span class="mode-t"><b>${title}</b><small>${detail}</small></span>
    ${run ? html`<${Icon} name="right" size="13" weight="3" class="chev" />` : null}</button>`;
  return html`<div class="screen-scroll"><div class="page">
    <${LobbyHeader} title="Футбольные крестики-нолики" back=${nav.back} />
    <section class="mode-group glass">
      <h4 class="mg-head"><i class="mg-dot on"></i>Онлайн<small>соперники с derbyo.online</small></h4>
      <button class="primary-btn" onClick=${() => nav.push("quickPick")}><img src=${img("bolt")} alt="" />Быстрая игра</button>
      <div class="two">
        <button class="navy-btn tall" onClick=${() => nav.push("room")}><img src=${img("invite")} alt="" />Создать</button>
        <button class="mint-btn tall press" onClick=${() => nav.push("code")}><img src=${img("arrow")} alt="" />По коду</button>
      </div>
    </section>
    <section class="mode-group glass">
      <h4 class="mg-head"><i class="mg-dot"></i>Офлайн<small>без рейтинга</small></h4>
      ${mode("bot", "С ботом", "Тренировка на настоящем поле", () => practice("bot"))}
      ${mode(null, "На одном телефоне", hotseat ? "Игрок 1 против Игрока 2" : "Скоро", hotseat ? () => practice("hotseat") : null)}
    </section>
    <${Section} t="ОТКРЫТЫЕ КОМНАТЫ" />
    ${err ? html`<p class="hint-line small pad">${err}</p>`
      : !rooms ? html`<p class="hint-line small pad">Загружаем комнаты…</p>`
      : !rooms.length ? html`<p class="hint-line small pad">Сейчас открытых комнат нет. Создай свою — и позови друга по коду.</p>`
      : html`<div class="room-tiles">${[...rooms].sort((a, b) => (b.openSeats > 0 && b.stage === "lobby") - (a.openSeats > 0 && a.stage === "lobby")).map((r) => html`<${RoomTile} r=${r} enter=${enter} />`)}</div>`}
  </div>
  ${locked ? html`<${RoomPassword} room=${`Комната ${locked.r.host ?? ""}`} cancel=${() => setLocked(null)}
    check=${async (pw) => { const ok = await app.joinRoom(locked.r.code, { role: locked.watch ? "spectator" : "player", password: pw }); if (ok !== false) setLocked(null); return ok !== false; }} />` : null}
  </div>`;
}

/** The quick game's search: a real ticket, polled every second; a bot can stand in after a few seconds. */
export function OnlineSearch({ done }) {
  const [s, setS] = useState(0);
  const [found, setFound] = useState(null);
  const [err, setErr] = useState(null);
  const ticket = useRef(null);
  const over = useRef(false);
  const lvl = PRESETS.find((p) => QuickChoice.presets.includes(p.id))?.name ?? "Любитель";
  useEffect(() => {
    let timer = null;
    const finish = (session) => { over.current = true; clearTimeout(timer); setFound(session); setTimeout(() => done({ session }), 900); };
    const poll = async () => {
      if (over.current) return;
      try {
        const r = await quick.status(ticket.current);
        if (r.status === "matched" && r.session) return finish(r.session);
        if (r.status === "restart") { const n = await quick.start(QuickChoice.presets, false, QuickChoice.people); ticket.current = n.ticket; }
        setS(Math.round(r.elapsed ?? 0));
      } catch (e) { setErr(e.message); return; }
      timer = setTimeout(poll, 1000);
    };
    quick.start(QuickChoice.presets, false, QuickChoice.people).then((r) => {
      ticket.current = r.ticket;
      if (r.status === "matched" && r.session) finish(r.session); else timer = setTimeout(poll, 1000);
    }).catch((e) => setErr(e.message));
    return () => { clearTimeout(timer); if (!over.current && ticket.current) quick.cancel(ticket.current); over.current = true; };
  }, []);
  const cancel = async (bot) => {
    if (over.current) return;
    over.current = true;
    const t = ticket.current;
    const r = t ? await quick.cancel(t) : null;
    // The cancel can come too late: then the match is already made, and it is ours.
    if (r?.session) { done({ session: r.session }); return; }
    done(bot ? { bot: true } : null);
  };
  const C = 2 * Math.PI * 85;
  const f = Math.min(1, s / 20);
  return html`<div class="search">
    <div class="search-head"><button class="text-btn red" onClick=${() => cancel(false)}>Отмена</button><b>Быстрая игра</b><span style="width:60px"></span></div>
    <div class="search-mid">
      <span class="search-ring"><svg viewBox="0 0 180 180"><circle cx="90" cy="90" r="85" fill="none" stroke="#17283A" stroke-width="10" />
        <circle class="arc slow" cx="90" cy="90" r="85" fill="none" stroke="#FF5364" stroke-width="10" stroke-linecap="round" stroke-dasharray=${C}
          stroke-dashoffset=${C * (1 - (found ? 1 : f))} transform="rotate(-90 90 90)" /></svg>
        <span><b>${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}</b><small>${found ? "найден" : "ищем"}</small></span></span>
      <h2>${err ? "Не получилось" : found ? "Соперник найден" : "Ищем соперника…"}</h2>
      <p>${err ?? (found ? `Комната ${found.code ?? ""} · ${lvl}` : QuickChoice.summary)}</p>
      ${s >= 5 && !found && !err ? html`<button class="navy-btn fade-in" onClick=${() => cancel(true)}><img src=${img("bot")} alt="" />Пока никого — играть с ботом</button>` : null}
    </div>
    <p class="search-foot">Ищем среди игроков derbyo.online. Можно открыть сайт на компьютере и сыграть с собой.</p>
  </div>`;
}

/** One player in the duel bubble: photo, name, flag with rating and place, readiness. */
function DuelSide({ p, red, side }) {
  if (!p) return html`<div class=${cx("ds free", side)}><span class="ds-av wait"><i></i><${Icon} name="question" size="22" weight="2" /></span>
    <b class="ds-name">Ждём игрока</b><small class="ds-none">место свободно</small></div>`;
  return html`<button class=${cx("ds press", side)} onClick=${p.open} aria-label=${`${p.name}, открыть профиль`}>
    <span class=${cx("ds-av", red ? "red" : "green", p.ready && "ready", p.gone && "gone")}>
      ${p.bot ? html`<img class="bot" src=${img("bot")} alt="" />` : p.photo ? html`<img class="photo" src=${p.photo} alt="" />` : html`<b>${p.name.slice(0, 2).toUpperCase()}</b>`}</span>
    <b class="ds-name">${p.name}</b>
    ${p.rating != null || p.flag ? html`<${RatingTag} flag=${p.flag} rating=${p.rating} rank=${p.rank} small=${11} />` : html`<small class="ds-none">${p.bot ? "учебный бот" : "без рейтинга"}</small>`}
    <span class=${cx("status-pill", p.gone ? "gone" : p.ready ? "ready" : "")}><i></i>${p.gone ? p.note : p.ready ? "Готов" : "Не готов"}</span>
  </button>`;
}

/** Both players in one bubble, face to face, with the VS emblem between them. */
const Duel = ({ left, right, leftRed = true, children }) => html`<div class="duel glass">
  <div class="duel-row">
    <${DuelSide} p=${left} red=${leftRed} side="l" />
    <span class="duel-vs" aria-hidden="true"><i>VS</i></span>
    <${DuelSide} p=${right} red=${!leftRed} side="r" />
  </div>${children}</div>`;

/** The room's chat and stands as two tabs of one card. */
function RoomTalk({ m }) {
  const [tab, setTab] = useState("chat");
  const [draft, setDraft] = useState("");
  const list = useRef();
  const chat = m?.chat ?? [], viewers = m?.viewers ?? [];
  useEffect(() => { if (list.current) list.current.scrollTop = list.current.scrollHeight; }, [chat.length, tab]);
  const send = (e) => { e.preventDefault(); const t = draft.trim(); if (!t || !m) return; m.send(t); setDraft(""); };
  return html`<div class="talk glass">
    <div class="segmented talk-tabs">
      <button class=${tab === "chat" ? "on" : ""} onClick=${() => setTab("chat")}><img src=${img("chat")} alt="" />Чат${chat.length ? html` <i>${chat.length}</i>` : null}</button>
      <button class=${tab === "stands" ? "on" : ""} onClick=${() => setTab("stands")}><img src=${img("eye")} alt="" />Трибуна <i>${viewers.length}</i></button>
    </div>
    ${tab === "chat" ? html`
      ${chat.length ? html`<div class="chat-list inline talk-list" ref=${list}>${chat.map((x) => html`<div class=${cx("msg", x.who === "Ты" && "me", x.spectator && "spec")}>
        <span class="who"><span>${x.who}</span>${x.spectator ? html`<i> · зритель</i>` : null}</span><span class="text">${x.text}</span></div>`)}</div>`
        : null}
      <form class="mini-field" onSubmit=${send} action="#">
        <input value=${draft} onInput=${(e) => setDraft(e.target.value)} placeholder=${chat.length ? "Сообщение" : "Пока тихо — напиши первым"} enterkeyhint="send" autocomplete="off" disabled=${!m} />
        <button type="submit" class=${cx("send", draft.trim() && "on")} disabled=${!draft.trim()} aria-label="Отправить"><${Icon} name="up" size="16" weight="3" /></button>
      </form>`
      : viewers.length ? html`<${ViewerList} viewers=${viewers} open=${() => {}} />`
      : html`<p class="talk-empty">На трибуне пока никого. Третий по коду сядет сюда.</p>`}
  </div>`;
}

/** «Готов. Ждём …» with «Отменить», when the server can take readiness back (the sandbox can, older servers cannot). */
const ReadyWait = ({ m, who }) => html`<div class="waiting-bar"><span class="spinner muted"></span>
  <span class="wb-t"><b>Готов. Ждём ${who}…</b><small>матч начнётся, когда оба готовы</small></span>
  ${m?.state && "freeLeave" in m.state ? html`<button class="navy-btn small wb-cancel" onClick=${() => m.unready().catch(() => {})}>Отменить</button>` : null}</div>`;

/** Hooks a screen to a room's live match; a room left behind (back, not into the match) is left on the server. */
function useRoom(make, app) {
  const [m, setM] = useState(null);
  const [err, setErr] = useState(null);
  const handed = useRef(false);
  const ref = useRef(null);
  useEffect(() => {
    let live = true;
    make().then((x) => { if (!live) { x.stop(); return; } ref.current = x; setM(x); }).catch((e) => live && setErr(e.message));
    return () => { live = false; if (ref.current && !handed.current) ref.current.stop(); };
  }, []);
  // The round started: the match screen takes the room over.
  useEffect(() => { if (m?.hasBoard && !handed.current) { handed.current = true; app.open(m); } });
  return [m, err];
}

/** «Создать»: your room on the server. The code is real; a friend joins it from the app or the site. */
export function OnlineRoom({ nav, app }) {
  const [settings, setSettings] = useState(newSettings());
  const [copied, setCopied] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [m, err] = useRoom(() => createRoom(createBody(settings)).then((s) => new OnlineMatch(s)), app);
  // The tap shows «Готов» at once; from the next server state on, the server's word is what shows.
  useEffect(() => setWaiting(false), [m?.state]);
  const first = useRef(true);
  // Changed settings go to the server, after the first (sent with the room itself).
  useEffect(() => { if (first.current) { first.current = false; return; } if (m && passwordOK(settings)) m.settings(createBody(settings)).catch(() => {}); }, [settings, m]);
  const code = m?.code ?? "··· ···";
  const text = `Сыграем в DERBYO? Комната ${code}: https://derbyo.online/#join=${code.replace(" ", "")}`;
  const share = async () => { try { if (navigator.share) await navigator.share({ text }); else { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); } } catch {} };
  const copy = async () => { try { await navigator.clipboard.writeText(code.replace(" ", "")); } catch {} setCopied(true); setTimeout(() => setCopied(false), 1500); };
  const friend = m?.them;
  const meReady = !!m?.me?.ready;
  const ex = [extras(settings), settings.closed ? "🔒 по паролю" : ""].filter(Boolean).join(" · ");
  const p = presetOf(settings);
  return html`<div class="screen-with-bar"><div class="screen-scroll"><div class="page">
    <${LobbyHeader} title="Комната" back=${nav.back} />
    <div class="code-bar glass">
      <span class="cb-t"><small class="cap">КОД КОМНАТЫ</small><b class="cb-code">${code}</b></span>
      <button class="cb-btn press" disabled=${!m} onClick=${copy} aria-label="Скопировать код"><${Icon} name=${copied ? "check" : "copy"} size="18" /></button>
      <button class="cb-btn main press" disabled=${!m} onClick=${share} aria-label="Поделиться"><${Icon} name="share" size="18" /></button>
    </div>
    <p class="hint-line small pad">${err ?? (copied ? "Скопировано — отправь другу" : "Друг войдёт по коду из приложения или на derbyo.online. Третий и дальше — на трибуну.")}</p>
    <${Duel} leftRed=${(m?.mySeat ?? 0) === 0}
      left=${{ name: m?.leftName ?? account.name, photo: m?.avatarOf(0) ?? account.profile?.avatar ?? null, flag: m?.myFlag, rating: m?.myRating ?? account.profile?.rating ?? null, rank: m?.myRank ?? null, ready: meReady, open: () => {} }}
      right=${friend ? { name: friend.name, bot: !!friend.bot, photo: m.avatarOf(1), flag: m.opponent.flag, rating: m.opponent.rating, rank: m.opponent.rank, ready: !!friend.ready, open: () => {} } : null}>
      ${!friend && m ? html`<button class="chip-btn duel-bot press" onClick=${() => m.addBot().catch(() => {})}><img src=${img("bot")} alt="" />Посадить бота</button>` : null}
    <//>
    <button class="settings-card press" onClick=${() => nav.push("settings", { settings, set: setSettings })}>
      <img src=${img(p?.icon ?? "settings")} alt="" />
      <span><small>Настройки матча</small><b>${summary(settings)}</b>${ex ? html`<em>${ex}</em>` : null}</span>
      <${Icon} name="right" size="13" weight="3" class="chev" />
    </button>
    <${RoomTalk} m=${m} />
  </div></div>
  <${BottomBar}>${meReady || waiting ? html`<${ReadyWait} m=${m} who=${friend?.name ?? "второго игрока"} />`
    : html`<button class="primary-btn" disabled=${!m || !friend || !passwordOK(settings)} onClick=${() => { setWaiting(true); m.ready().catch(() => setWaiting(false)); }}>
    ${!passwordOK(settings) ? "Задай пароль от 4 символов" : !friend ? "Ждём второго игрока" : "Начать матч"}</button>`}<//>
  </div>`;
}

/** «По коду»: six digits, then the server's room (a password if it asks for one). */
export function OnlineJoinCode({ nav, app }) {
  const [digits, setDigits] = useState("");
  const [focused, setFocused] = useState(false);
  const [askPw, setAskPw] = useState(false);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const ref = useRef();
  useEffect(() => { ref.current?.focus(); }, []);
  const paste = async () => { try { const t = await navigator.clipboard.readText(); setDigits(t.replace(/\D/g, "").slice(0, 6)); } catch {} };
  const enter = async (password) => {
    setBusy(true); setErr(null);
    const ok = await app.joinRoom(digits, { password, role: "player", onError: setErr });
    setBusy(false);
    if (ok === false) setAskPw(true);
    return ok !== false;
  };
  return html`<div class="screen-with-bar"><div class="screen-scroll"><div class="page">
    <${LobbyHeader} title="Войти по коду" back=${nav.back} />
    <p class="lead-text">Введи 6 цифр, которые прислал друг</p>
    <label class="code-boxes">
      <input ref=${ref} inputmode="numeric" autocomplete="one-time-code" value=${digits} onFocus=${() => setFocused(true)} onBlur=${() => setFocused(false)}
        onInput=${(e) => { const v = e.target.value.replace(/\D/g, "").slice(0, 6); e.target.value = v; setDigits(v); setErr(null); }} aria-label="Код комнаты" />
      ${[0, 1, 2, 3, 4, 5].map((i) => html`${i === 3 ? html`<i class="dash">–</i>` : null}<span class=${cx("box", i === digits.length && focused && "cur")}>${digits[i] ?? ""}</span>`)}
    </label>
    ${err ? html`<p class="hint-line small" style="color:#FF9AA8">${err}</p>` : null}
    <button class="text-btn muted" onClick=${paste}><${Icon} name="paste" size="15" />Вставить из буфера</button>
  </div></div>
  <${BottomBar}>
    <button class="primary-btn" disabled=${digits.length < 6 || busy} onClick=${() => enter()}>${busy ? html`<span class="spinner"></span>` : "Войти"}</button>
    <p class="hint-line small center">Если оба места заняты, ты попадёшь на трибуну и будешь смотреть матч.</p>
  <//>
  ${askPw ? html`<${RoomPassword} room=${`Комната ${digits.slice(0, 3)} ${digits.slice(3)}`} cancel=${() => setAskPw(false)}
    check=${async (pw) => { const ok = await enter(pw); if (ok) setAskPw(false); return ok; }} />` : null}
  </div>`;
}

/** «Раздевалка»: your seat in someone's room before the start; the match begins when both press «Я готов». */
export function OnlineLocker({ nav, app, m }) {
  const [open, setOpen] = useState({ settings: false });
  const [profile, setProfile] = useState(null);
  const handed = useRef(false);
  useEffect(() => () => { if (!handed.current) m.stop(); }, []);
  useEffect(() => { if (m.hasBoard && !handed.current) { handed.current = true; app.open(m); } });
  const st = m.state;
  const host = m.them;
  const settings = fromServer(st?.settings, st?.locked);
  const flip = (k) => setOpen({ ...open, [k]: !open[k] });
  const meReady = !!m.me?.ready;
  return html`<div class="screen-with-bar"><div class="screen-scroll"><div class="page">
    <${LobbyHeader} title=${`Комната ${m.code}`} back=${nav.back} />
    <div class="locker-title"><small class="cap gold">РАЗДЕВАЛКА</small><h2>${m.closed ? "Комната закрыта" : !host ? "Ждём второго игрока" : "Оба на месте. Пора играть."}</h2></div>
    <${Duel} leftRed=${m.mySeat === 0}
      left=${{ name: m.leftName, photo: m.avatarOf(0), flag: m.myFlag, rating: m.myRating, rank: m.myRank, ready: meReady, open: () => setProfile({ owner: 0 }) }}
      right=${host ? { name: host.name, bot: !!host.bot, photo: m.avatarOf(1), flag: m.opponent.flag, rating: m.opponent.rating, rank: m.opponent.rank, ready: !!host.ready, gone: !host.online, note: "не в сети", open: () => setProfile({ owner: 1 }) } : null} />
    <${Collapsible} title="НАСТРОЙКИ МАТЧА" summary=${summary(settings)} open=${open.settings} toggle=${() => flip("settings")}>
      <div class="set-rows">${settingRows(settings).map(([k, v]) => html`<div><span>${k}</span><b>${v}</b></div>`)}</div>
    <//>
    <${RoomTalk} m=${m} />
    <p class="hint-line small">Первый ход — ×. Подсказки и поле общие для всех подключившихся.</p>
  </div></div>
  <${BottomBar}>
    ${m.closed ? html`<button class="primary-btn" onClick=${nav.back}>К списку комнат</button>`
      : meReady ? html`<${ReadyWait} m=${m} who=${host?.name ?? "соперника"} />`
      : html`<button class="primary-btn" disabled=${!host} onClick=${() => m.ready().catch(() => {})}>${host ? "Я готов — начать матч" : "Ждём второго игрока"}</button>`}
  <//>
  ${profile ? html`<${Panel} onClose=${() => setProfile(null)}>${(leave) => html`<${ProfileSheet} m=${m} owner=${profile.owner} close=${leave} />`}<//>` : null}
  </div>`;
}
