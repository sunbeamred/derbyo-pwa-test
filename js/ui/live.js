// The «Играть» screens on the site's server: open rooms, the quick game's search, your room, joining by code,
// someone's room before the start. Same look as the offline prototype's (lobby.js), real data underneath.
import { html, useState, useEffect, useRef, cx, img, Icon, BottomBar, LobbyHeader, Panel } from "./common.js";
import { PRESETS, LEVELS, QuickChoice, Section, RoomPassword, SeatCard, Collapsible, summary, settingRows, extras, passwordOK, newSettings, presetOf, presetsOf } from "./lobby.js";
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
  return { ...body, penaltiesOnDraw: false, lastChance: false,
    accessType: s.closed ? "closed" : "open", ...(s.closed ? { password: s.password } : {}) };
}
/** The site's room settings in the settings screen's shape (for the summary and the rows). */
export function fromServer(x = {}, locked = false) {
  const presets = Array.isArray(x.roundPresets) ? [...new Set(x.roundPresets)] : [];
  const preset = presets[0] ?? (PRESETS.some((p) => p.id === x.id) ? x.id : null);
  return newSettings({ preset, presets: preset ? (presets.length ? presets : [preset]) : [], level: x.level ?? 2, seconds: x.seconds ?? 60, tokens: x.tokens ?? 4, theme: x.theme ?? "mixed", progressive: !!x.progressive,
    format: x.winsRequired === 2 ? "twoWins" : x.tiebreak ? "tiebreak" : "rounds", rounds: x.rounds ?? 3,
    penaltiesOnDraw: !!x.penaltiesOnDraw, penaltiesEachRound: x.penaltiesScope === "round", lastChance: !!x.lastChance, closed: locked, password: locked ? "••••" : "" });
}

const STAGE = { lobby: "Ждёт игрока", playing: "В игре", paused: "Пауза", between: "Между раундами", complete: "Матч окончен" };

/** An open room as on the site's list, shorter: the level's icon, its state, then both seats with photos and names. */
function RoomTile({ r, enter }) {
  const lv = PRESETS.find((p) => p.level === (r.level ?? 2)) ?? PRESETS[1];
  const playing = r.stage === "playing" || r.stage === "paused";
  const seat = (p) => (p ? html`<span class="rt-seat">${p.bot ? html`<span class="pf-avatar neutral mini"><img src=${img("bot")} alt="" /></span>` : html`<${Face} name=${p.name} photo=${p.avatar} small=${true} />`}<b>${p.name}</b></span>`
    : html`<span class="rt-seat vacant"><span class="pf-avatar mini empty">+</span><b>свободно</b></span>`);
  const players = r.players?.length ? r.players : [{ name: r.host ?? "Игрок" }, null];
  return html`<div class="room-tile glass">
    <div class="rt-top">
      <img class="rt-level" src=${img(r.mode === "penalties" ? "whistle" : lv.icon)} alt="" />
      <span class="rt-t"><b>${r.mode === "penalties" ? "Пенальти" : lv.name}${r.progressive ? html` <img class="rt-up" src=${img("arrow")} alt="растёт" />` : null}</b>
        <small><i class=${cx("rt-dot", playing && "on")}></i>${STAGE[r.stage] ?? r.stage}${r.round ? ` · раунд ${r.round}` : ""}${r.seconds ? ` · ${r.seconds} с` : ""}</small></span>
      ${r.locked ? html`<span class="rt-lock"><img src=${img("lock")} alt="С паролем" /></span>` : null}
      ${r.viewers ? html`<span class="rt-view"><${Icon} name="eye" size="12" />${r.viewers}</span>` : null}
      ${r.openSeats > 0 && r.stage === "lobby" ? html`<button class="join-btn press" onClick=${() => enter(r, false)}>Войти</button>`
        : r.canWatch ? html`<button class="navy-btn small watch" onClick=${() => enter(r, true)}>Смотреть</button>` : null}
    </div>
    <span class="rt-players">${seat(players[0])}<i class="rt-vs">×</i>${seat(players[1])}</span>
  </div>`;
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
  const remembered = QuickChoice.remember;
  const enter = (r, watch) => (r.locked ? setLocked({ r, watch }) : app.joinRoom(r.code, { role: watch ? "spectator" : "player" }));
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
    ${mode("bot", "С ботом", "Тренировка на настоящем поле", () => app.bot())}
    ${mode(null, "На одном телефоне", "Скоро", null)}
    <${Section} t="ОТКРЫТЫЕ КОМНАТЫ" />
    ${err ? html`<p class="hint-line small pad">${err}</p>`
      : !rooms ? html`<p class="hint-line small pad">Загружаем комнаты…</p>`
      : !rooms.length ? html`<p class="hint-line small pad">Сейчас открытых комнат нет. Создай свою — и позови друга по коду.</p>`
      : html`<div class="room-tiles">${rooms.map((r) => html`<${RoomTile} r=${r} enter=${enter} />`)}</div>`}
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
        if (r.status === "restart") { const n = await quick.start(QuickChoice.presets); ticket.current = n.ticket; }
        setS(Math.round(r.elapsed ?? 0));
      } catch (e) { setErr(e.message); return; }
      timer = setTimeout(poll, 1000);
    };
    quick.start(QuickChoice.presets).then((r) => {
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
  const text = `Сыграем в DERBYO? Комната ${code}: derbyo.online/r/${code.replace(" ", "")}`;
  const share = async () => { try { if (navigator.share) await navigator.share({ text }); else { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); } } catch {} };
  const copy = async () => { try { await navigator.clipboard.writeText(code.replace(" ", "")); } catch {} setCopied(true); setTimeout(() => setCopied(false), 1500); };
  const friend = m?.them;
  const meReady = !!m?.me?.ready;
  const ex = [extras(settings), settings.closed ? "🔒 по паролю" : ""].filter(Boolean).join(" · ");
  const p = presetOf(settings);
  return html`<div class="screen-with-bar"><div class="screen-scroll"><div class="page">
    <${LobbyHeader} title="Комната" back=${nav.back} />
    <div class="code-card glass">
      <small class="cap">КОД КОМНАТЫ</small>
      <b class="room-code">${code}</b>
      <div class="two">
        <button class="primary-btn" disabled=${!m} onClick=${share}><${Icon} name="share" size="17" />Поделиться</button>
        <button class="navy-btn tall code-copy" disabled=${!m} onClick=${copy}><${Icon} name=${copied ? "check" : "copy"} size="16" />${copied ? "Скопирован" : "Код"}</button>
      </div>
      <p class="hint-line small center">${err ?? "Отправь код другу: он войдёт из приложения или на derbyo.online. Третий и дальше попадут на трибуну."}</p>
    </div>
    <div class="seats">
      <${SeatCard} name=${m?.leftName ?? account.name} red=${(m?.mySeat ?? 0) === 0} ready=${meReady} />
      <b class="vs">vs</b>
      ${friend ? html`<${SeatCard} name=${friend.name} red=${(m?.mySeat ?? 0) === 1} ready=${!!friend.ready} />`
        : html`<div class="seat-wait"><span class="pulse-av"><i></i><${Icon} name="question" size="20" weight="2" /></span><b>Ждём друга…</b><small>место свободно</small></div>`}
    </div>
    <button class="settings-card press" onClick=${() => nav.push("settings", { settings, set: setSettings })}>
      <img src=${img(p?.icon ?? "settings")} alt="" />
      <span><small>Настройки матча</small><b>${summary(settings)}</b>${ex ? html`<em>${ex}</em>` : null}</span>
      <${Icon} name="right" size="13" weight="3" class="chev" />
    </button>
    ${!friend && m ? html`<button class="navy-btn" onClick=${() => m.addBot().catch(() => {})}><img src=${img("bot")} alt="" />Посадить бота</button>` : null}
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
  const [open, setOpen] = useState({ settings: true, chat: true, stands: false });
  const [draft, setDraft] = useState("");
  const [profile, setProfile] = useState(null);
  const handed = useRef(false);
  useEffect(() => () => { if (!handed.current) m.stop(); }, []);
  useEffect(() => { if (m.hasBoard && !handed.current) { handed.current = true; app.open(m); } });
  const st = m.state;
  const host = m.them;
  const settings = fromServer(st?.settings, st?.locked);
  const flip = (k) => setOpen({ ...open, [k]: !open[k] });
  const send = (e) => { e.preventDefault(); const t = draft.trim(); if (!t) return; m.send(t); setDraft(""); };
  const last = m.chat[m.chat.length - 1];
  const meReady = !!m.me?.ready;
  return html`<div class="screen-with-bar"><div class="screen-scroll"><div class="page">
    <${LobbyHeader} title=${`Комната ${m.code}`} back=${nav.back} />
    <div class="locker-title"><small class="cap gold">РАЗДЕВАЛКА</small><h2>${m.closed ? "Комната закрыта" : !host ? "Ждём второго игрока" : "Оба на месте. Пора играть."}</h2></div>
    <div class="seats">
      ${host ? html`<${SeatCard} name=${host.name} red=${m.mySeat === 1} ready=${!!host.ready} gone=${!host.online} note="не в сети" open=${() => setProfile({ owner: 1 })} />`
        : html`<div class="seat-wait"><span class="pulse-av"><i></i><${Icon} name="question" size="20" weight="2" /></span><b>Место свободно</b><small>ждём игрока</small></div>`}
      <b class="vs">vs</b>
      <${SeatCard} name=${m.leftName} red=${m.mySeat === 0} ready=${meReady} open=${() => setProfile({ owner: 0 })} />
    </div>
    <${Collapsible} title="НАСТРОЙКИ МАТЧА" summary=${summary(settings)} open=${open.settings} toggle=${() => flip("settings")}>
      <div class="set-rows">${settingRows(settings).map(([k, v]) => html`<div><span>${k}</span><b>${v}</b></div>`)}</div>
    <//>
    <${Collapsible} title="ЧАТ КОМНАТЫ" summary=${last ? `${last.who}: ${last.text}` : "пока тихо"} open=${open.chat} toggle=${() => flip("chat")}>
      <div class="chat-list inline">${m.chat.map((x) => html`<div class=${cx("msg", x.who === "Ты" && "me", x.spectator && "spec")}>
        <span class="who"><span>${x.who}</span>${x.spectator ? html`<i> · зритель</i>` : null}</span>
        <span class="text">${x.text}</span></div>`)}</div>
      <form class="mini-field" onSubmit=${send} action="#">
        <input value=${draft} onInput=${(e) => setDraft(e.target.value)} placeholder="Напиши сообщение" enterkeyhint="send" autocomplete="off" />
        <button type="submit" class=${cx("send", draft.trim() && "on")} disabled=${!draft.trim()} aria-label="Отправить"><${Icon} name="up" size="16" weight="3" /></button>
      </form>
    <//>
    <${Collapsible} title=${`ТРИБУНА · ${m.viewers.length} / 24`} summary=${m.viewers.join(", ") || "никого"} open=${open.stands} toggle=${() => flip("stands")}>
      <${ViewerList} viewers=${m.viewers} open=${() => {}} />
    <//>
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
