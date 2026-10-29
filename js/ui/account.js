// The «Рейтинг» and «Профиль» tabs on the site's data: the leaderboard; your account (guest, login, register),
// its photo and country (sandbox), friends, password and the phone's settings.
import { html, useState, useEffect, useRef, cx, Icon, rankTier, tierStyle, placeStyle, levelColor, Prefs, vibrate } from "./common.js";
import { account, leaderboard, playerProfile, social } from "../net.js";
import { Sound } from "../sound.js";
import { flagOf } from "../online.js";
import { Panel } from "./common.js";

const PERIODS = [["rating", "Рейтинг"], ["week", "Неделя"], ["friends", "Друзья"]];

export function RatingTab({ visible }) {
  const [period, setPeriod] = useState("rating");
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [open, setOpen] = useState(null);
  useEffect(() => {
    if (!visible) return;
    let live = true;
    setErr(null);
    leaderboard(period).then((r) => live && setData(r)).catch((e) => live && setErr(e.message));
    return () => { live = false; };
  }, [period, visible, account.profile?.id]);
  const list = data?.period === period ? data.entries : null;
  return html`<div class="screen-scroll"><div class="page">
    <h1 class="big-title">Рейтинг</h1>
    <div class="segmented">${PERIODS.map(([id, t]) => html`<button class=${period === id ? "on" : ""} onClick=${() => setPeriod(id)}>${t}</button>`)}</div>
    ${err ? html`<p class="hint-line pad">${err}</p>`
      : !list ? html`<p class="hint-line pad">Загружаем…</p>`
      : data.requiresLogin ? html`<p class="placeholder">Друзья видны после входа в аккаунт — вкладка «Профиль».</p>`
      : !list.length ? html`<p class="placeholder">${period === "week" ? "На этой неделе ещё никто не набрал очков." : "Пока пусто."}</p>`
      : html`<div class="board-list glass">${list.map((e) => html`<button class=${cx("lb-row press", e.self && "self")} onClick=${() => setOpen(e.id)}>
          <b class=${cx("lb-place num", placeStyle(e.rank) && "grad")} style=${placeStyle(e.rank)}>${e.rank}</b>
          <${Face} name=${e.nickname} photo=${e.avatar} small=${true} /><span class="lb-name"><b>${flagOf(e.country) ? html`<i class="flag">${flagOf(e.country)}</i> ` : null}${e.nickname}</b><small>${e.games} игр · ${e.winRate}% побед</small></span>
          <b class="lb-pts grad num" style=${tierStyle(e.rating ?? 0)}>${period === "week" ? (e.points > 0 ? "+" : "") + e.points : e.rating}</b>
        </button>`)}</div>
        <p class="hint-line small center">${data.total} игроков в рейтинге · рейтинг после 5 игр с двумя разными соперниками</p>`}
  </div>
  ${open ? html`<${Panel} onClose=${() => setOpen(null)}><${PlayerCard} id=${open} /><//>` : null}
  </div>`;
}

/** A player's face: the profile photo, or the first two letters of the nickname. */
export const Face = ({ name, photo, small }) => html`<span class=${cx("pf-avatar neutral", small && "mini")}>${photo ? html`<img class="photo" src=${photo} alt="" />` : (name || "?").slice(0, 2).toUpperCase()}</span>`;

const PRESENCE = { online: "в сети", in_match: "в матче", offline: "не в сети" };

/** A registered player's public card from the site, with friendship actions. */
function PlayerCard({ id, onChange }) {
  const [p, setP] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { playerProfile(id).then(setP).catch((e) => setErr(e.message)); }, [id]);
  if (err) return html`<div class="profile"><p class="hint-line">${err}</p></div>`;
  if (!p) return html`<div class="profile"><p class="hint-line">Загружаем…</p></div>`;
  const t = rankTier(p.rating ?? 0);
  const h = p.headToHead;
  const self = p.id === account.profile?.id;
  const act = async (action) => {
    setBusy(true); setErr(null);
    try { const r = await social.friend(p.id, action); setP({ ...p, relationship: r.relationship }); onChange?.(); vibrate(10); }
    catch (x) { setErr(x.message); }
    setBusy(false);
  };
  const rel = p.relationship;
  return html`<div class="profile">
    <div class="pf-head">
      <${Face} name=${p.nickname} photo=${p.avatar} />
      <span class="pf-name"><b>${p.nickname}</b><span>${flagOf(p.country) ? html`<i class="flag">${flagOf(p.country)}</i>` : null}<em class="lvl" style=${`--c:${levelColor(p.level)}`}>Ур. ${p.level}</em>
        ${p.presence ? html`<small>${PRESENCE[p.presence]}</small>` : null}</span></span>
      <span class="pf-rating">${p.rating != null ? html`<b class="grad" style=${`${tierStyle(p.rating)};filter:drop-shadow(0 0 6px ${t.b}80)`}>${p.rating}</b><small>${t.name}</small>`
        : html`<small>калибровка</small>`}</span>
    </div>
    <div class="pf-stats"><span><b>${p.games}</b><small>Игр</small></span><span><b>${p.winRate}%</b><small>Побед</small></span><span><b>${p.bestStreak}</b><small>Лучшая серия</small></span></div>
    ${h && h.games ? html`<div class="h2h"><div><small>Ваши встречи</small><span class="sp"></span><b>${h.wins} : ${h.losses}</b>${h.draws ? html`<em>ничьих ${h.draws}</em>` : null}</div></div>` : null}
    ${account.registered && !self ? html`<div class="pf-actions">
      ${rel === "none" ? html`<button class="green-btn press" disabled=${busy} onClick=${() => act("request")}><${Icon} name="friendAdd" size="17" />Добавить в друзья</button>`
        : rel === "incoming" ? html`<div class="two"><button class="green-btn press" disabled=${busy} onClick=${() => act("accept")}>Принять заявку</button><button class="navy-btn tall press" disabled=${busy} onClick=${() => act("decline")}>Отклонить</button></div>`
        : rel === "outgoing" ? html`<button class="navy-btn press" disabled=${busy} onClick=${() => act("cancel")}>Заявка отправлена · отменить</button>`
        : rel === "friends" ? html`<button class="navy-btn press" disabled=${busy} onClick=${() => act("remove")}>Удалить из друзей</button>`
        : rel === "blocked" ? html`<button class="navy-btn press" disabled=${busy} onClick=${() => act("unblock")}>Разблокировать</button>` : null}
    </div>` : null}
    ${err ? html`<p class="hint-line small pad" style="color:#FF9AA8">${err}</p>` : null}
  </div>`;
}

/** Friends from the site: requests to answer, the list with who is online, sent requests and a search by nickname. */
function Friends({ open }) {
  const [st, setSt] = useState(null);
  const [q, setQ] = useState("");
  const [found, setFound] = useState(null);
  const [err, setErr] = useState(null);
  const load = () => social.state().then(setSt).catch((e) => setErr(e.message));
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, []);
  useEffect(() => {
    const v = q.trim();
    if (v.length < 3) { setFound(null); return; }
    const t = setTimeout(() => social.search(v).then(setFound).catch((e) => setErr(e.message)), 350);
    return () => clearTimeout(t);
  }, [q]);
  const answer = async (id, action) => { try { await social.friend(id, action); vibrate(10); load(); } catch (x) { setErr(x.message); } };
  const row = (p, side) => html`<div class="fr-row">
    <button class="fr-who press" onClick=${() => open(p.id, load)}><${Face} name=${p.nickname} photo=${p.avatar} small=${true} />
      <span class="lb-name"><b>${flagOf(p.country) ? html`<i class="flag">${flagOf(p.country)}</i> ` : null}${p.nickname}</b>
        <small class=${cx(p.presence && "pres-" + p.presence)}>${p.presence ? PRESENCE[p.presence] : p.rating != null ? `рейтинг ${p.rating}` : `ур. ${p.level}`}</small></span></button>
    ${side}</div>`;
  if (!st) return html`<p class="hint-line pad">${err ?? "Загружаем друзей…"}</p>`;
  return html`
    <label class="pw-field"><${Icon} name="search" size="16" /><input value=${q} onInput=${(e) => setQ(e.target.value)} placeholder="Найти игрока по нику"
      autocapitalize="off" autocorrect="off" spellcheck="false" /></label>
    ${found ? html`<div class="board-list glass">${found.length ? found.map((p) => row(p,
        p.relationship === "none" ? html`<button class="chip-btn press" onClick=${async () => { await answer(p.id, "request"); setFound(found.map((x) => (x.id === p.id ? { ...x, relationship: "outgoing" } : x))); }}><${Icon} name="friendAdd" size="15" />Добавить</button>`
        : html`<small class="fr-note">${{ friends: "в друзьях", outgoing: "заявка отправлена", incoming: "ждёт ответа", blocked: "заблокирован" }[p.relationship] ?? ""}</small>`))
      : html`<p class="hint-line pad">Никого не нашли.</p>`}</div>` : null}
    ${st.incoming.length ? html`<h4 class="section">ЗАЯВКИ · ${st.incoming.length}</h4><div class="board-list glass">${st.incoming.map((p) => row(p, html`<span class="fr-btns">
      <button class="round-ok press" aria-label="Принять" onClick=${() => answer(p.id, "accept")}><${Icon} name="check" size="16" weight="2.5" /></button>
      <button class="round-no press" aria-label="Отклонить" onClick=${() => answer(p.id, "decline")}><${Icon} name="x" size="14" weight="2.5" /></button></span>`))}</div>` : null}
    <h4 class="section">ДРУЗЬЯ · ${st.friends.length}</h4>
    ${st.friends.length ? html`<div class="board-list glass">${st.friends.map((p) => row(p, html`<${Icon} name="right" size="14" style="opacity:.4" />`))}</div>`
      : html`<p class="hint-line small pad">Пока никого. Найди друга по нику или открой профиль соперника после матча.</p>`}
    ${st.outgoing.length ? html`<h4 class="section">ОТПРАВЛЕННЫЕ</h4><div class="board-list glass">${st.outgoing.map((p) => row(p,
      html`<button class="text-btn muted" onClick=${() => answer(p.id, "cancel")}>Отменить</button>`))}</div>` : null}
    ${err ? html`<p class="hint-line small pad" style="color:#FF9AA8">${err}</p>` : null}`;
}

// Countries for the flag: the codes, named in Russian by the browser; the nearest ones first.
const NEAR = ["KZ", "RU", "UZ", "KG", "TJ", "TM", "AZ", "AM", "GE", "BY", "UA", "MD", "TR"];
const WORLD = "AD AE AF AG AL AO AR AT AU BA BB BD BE BF BG BH BI BJ BN BO BR BS BT BW BZ CA CD CF CG CH CI CL CM CN CO CR CU CV CY CZ DE DJ DK DM DO DZ EC EE EG ER ES ET FI FJ FR GA GB GD GH GM GN GQ GR GT GW GY HN HR HT HU ID IE IL IN IQ IR IS IT JM JO JP KE KH KM KN KP KR KW LA LB LC LI LK LR LS LT LU LV LY MA MC ME MG MK ML MM MN MR MT MU MV MW MX MY MZ NA NE NG NI NL NO NP NZ OM PA PE PG PH PK PL PS PT PY QA RO RS RW SA SC SD SE SG SI SK SL SM SN SO SR SS SV SY SZ TD TG TH TL TN TO TT TW TZ UG US UY VA VC VE VN YE ZA ZM ZW".split(" ");
let regionNames = null;
const countryName = (c) => { try { regionNames ??= new Intl.DisplayNames(["ru"], { type: "region" }); return regionNames.of(c); } catch { return c; } };
const countries = () => [...NEAR, ...WORLD.filter((c) => !NEAR.includes(c)).sort((a, b) => countryName(a).localeCompare(countryName(b), "ru"))];

/** A square photo, cropped to the middle and shrunk until it fits the server's 48 KB. */
async function squarePhoto(file) {
  const url = URL.createObjectURL(file);
  try {
    const im = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error("Не удалось открыть фото.")); i.src = url; });
    for (const [size, q] of [[256, 0.82], [224, 0.72], [192, 0.62], [160, 0.55]]) {
      const c = document.createElement("canvas"); c.width = c.height = size;
      const side = Math.min(im.naturalWidth, im.naturalHeight);
      c.getContext("2d").drawImage(im, (im.naturalWidth - side) / 2, (im.naturalHeight - side) / 2, side, side, 0, 0, size, size);
      const data = c.toDataURL("image/jpeg", q);
      if ((data.length - 23) * 0.75 < 44 * 1024) return data;
    }
    throw new Error("Фото слишком большое.");
  } finally { URL.revokeObjectURL(url); }
}

/** Your nickname, country and photo (the sandbox server keeps them; the site has no such editing). */
function EditProfile({ done }) {
  const p = account.profile;
  const [nick, setNick] = useState(p.nickname);
  const [country, setCountry] = useState(p.country ?? "");
  const [photo, setPhoto] = useState(p.avatar);
  const [newPhoto, setNewPhoto] = useState(undefined);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const file = useRef();
  const pick = async (e) => {
    const f = e.target.files?.[0]; e.target.value = "";
    if (!f) return;
    setErr(null);
    try { const d = await squarePhoto(f); setNewPhoto(d); setPhoto(d); } catch (x) { setErr(x.message); }
  };
  const save = async () => {
    setBusy(true); setErr(null);
    try {
      await account.send("profile", { ...(nick.trim() !== p.nickname ? { nickname: nick.trim() } : {}), country: country || null, ...(newPhoto !== undefined ? { avatar: newPhoto } : {}) });
      vibrate(10); done();
    } catch (x) { setErr(x.message); setBusy(false); }
  };
  return html`<div class="profile edit-profile">
    <h3 class="sheet-title">Профиль</h3>
    <div class="ep-photo">
      <${Face} name=${nick} photo=${photo} />
      <span class="ep-btns"><button class="chip-btn press" onClick=${() => file.current.click()}>${photo ? "Сменить фото" : "Выбрать фото"}</button>
        ${photo ? html`<button class="text-btn muted" onClick=${() => { setPhoto(null); setNewPhoto(null); }}>Убрать</button>` : null}</span>
      <input ref=${file} type="file" accept="image/*" hidden onChange=${pick} />
    </div>
    <h4 class="section">НИК</h4>
    <label class="pw-field"><${Icon} name="profile" size="16" /><input value=${nick} maxlength="20" onInput=${(e) => setNick(e.target.value)} autocapitalize="off" autocorrect="off" spellcheck="false" /></label>
    <h4 class="section">СТРАНА</h4>
    <label class="picker-row glass"><span>${country ? html`<i class="flag">${flagOf(country)}</i> ${countryName(country)}` : "Не указана"}</span>
      <span class="picker"><${Icon} name="down" size="11" weight="3" />
        <select value=${country} onChange=${(e) => setCountry(e.target.value)}>
          <option value="">Не указана</option>
          ${countries().map((c) => html`<option value=${c}>${flagOf(c)} ${countryName(c)}</option>`)}</select></span></label>
    ${err ? html`<p class="hint-line small pad" style="color:#FF9AA8">${err}</p>` : null}
    <button class="primary-btn" disabled=${busy || nick.trim().length < 3} onClick=${save}>${busy ? html`<span class="spinner"></span>` : "Сохранить"}</button>
  </div>`;
}

/** The site's password change: the current one, then the new one twice. */
function ChangePassword({ done }) {
  const [f, setF] = useState({ currentPassword: "", password: "", confirmPassword: "" });
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const field = (k, ph, ac) => html`<label class="pw-field"><${Icon} name="lock" size="16" /><input type="password" value=${f[k]} placeholder=${ph} autocomplete=${ac}
    onInput=${(e) => setF({ ...f, [k]: e.target.value })} /></label>`;
  const save = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try { await account.send("password", f); vibrate(10); done(); } catch (x) { setErr(x.message); setBusy(false); }
  };
  return html`<form class="profile auth" onSubmit=${save}>
    <h3 class="sheet-title">Смена пароля</h3>
    ${field("currentPassword", "Текущий пароль", "current-password")}
    ${field("password", "Новый пароль · от 6 символов", "new-password")}
    ${field("confirmPassword", "Новый пароль ещё раз", "new-password")}
    ${err ? html`<p class="hint-line small pad" style="color:#FF9AA8">${err}</p>` : null}
    <button class="primary-btn" type="submit" disabled=${busy || !f.currentPassword || f.password.length < 6 || f.password !== f.confirmPassword}>${busy ? html`<span class="spinner"></span>` : "Сменить пароль"}</button>
    <p class="hint-line small pad">Другие устройства выйдут из аккаунта. Код восстановления остаётся прежним.</p>
  </form>`;
}

/** Sound, vibration: kept on this phone. */
function Settings() {
  const [, redraw] = useState(0);
  const row = (icon, title, detail, on, set) => html`<label class="toggle-card">
    <span class="tc-ic"><${Icon} name=${icon} size="18" weight="2" /></span>
    <span class="tc-t"><b>${title}</b><small>${detail}</small></span>
    <input type="checkbox" class="switch" checked=${on} onChange=${(e) => { set(e.target.checked); redraw((n) => n + 1); }} /></label>`;
  return html`<div class="settings-list">
    ${row("sparkles", "Звук", "Ходы, таймер, победа", Sound.enabled, (v) => { Sound.enabled = v; if (v) Sound.play("turn"); })}
    ${row("phone", "Вибрация", "Отклик на нажатия и ходы", Prefs.vibration, (v) => { Prefs.vibration = v; vibrate(15); })}
  </div>`;
}

/** Your account: a guest name, or the site's login and registration; then your numbers, friends and settings. */
export function ProfileTab({ children }) {
  const p = account.profile;
  const [mode, setMode] = useState(null);
  const [nick, setNick] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [recovery, setRecovery] = useState(null);
  const [guest, setGuest] = useState(account.name);
  const [sheet, setSheet] = useState(null);
  const [shut, setShut] = useState(false);
  const [friendsKey, setFriendsKey] = useState(0);
  const openSheet = (s) => { setShut(false); setSheet(s); };
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const r = await account.send(mode, { nickname: nick.trim(), password: pw });
      if (r.recovery) setRecovery(r.recovery);
      setMode(null); setPw("");
    } catch (x) { setErr(x.message); }
    setBusy(false);
  };
  const logout = async () => { setBusy(true); try { await account.send("logout", {}); } catch (x) { setErr(x.message); } setBusy(false); };
  if (!account.ready) return html`<div class="screen-scroll"><div class="page"><h1 class="big-title">Профиль</h1><p class="hint-line pad">Соединяемся с derbyo.online…</p>${children}</div></div>`;
  const t = rankTier(p.rating ?? 0);
  const editable = p.registered && "avatar" in p;
  return html`<div class="screen-scroll"><div class="page">
    <h1 class="big-title">Профиль</h1>
    <div class="profile glass account-card">
      <div class="pf-head">
        ${editable ? html`<button class="face-btn press" aria-label="Изменить профиль" onClick=${() => openSheet({ kind: "edit" })}><${Face} name=${account.name} photo=${p.avatar} /><i class="face-edit"><${Icon} name="plusSquare" size="12" weight="2.5" /></i></button>`
          : html`<${Face} name=${account.name} photo=${p.avatar} />`}
        <span class="pf-name"><b>${account.name}</b><span>${flagOf(p.country) ? html`<i class="flag">${flagOf(p.country)}</i>` : null}<em class="lvl" style=${`--c:${levelColor(p.level)}`}>Ур. ${p.level}</em>${p.registered ? null : html`<small>гость</small>`}</span></span>
        <span class="pf-rating">${p.rating != null ? html`<b class="grad" style=${`${tierStyle(p.rating)};filter:drop-shadow(0 0 6px ${t.b}80)`}>${p.rating}</b>
          <small>${p.rank ? html`<span class=${cx(placeStyle(p.rank) && "grad")} style=${placeStyle(p.rank)}>${p.rank}</span> место` : t.name}</small>`
          : html`<small>${p.registered ? "рейтинг после 5 игр" : "рейтинг — после входа"}</small>`}</span>
      </div>
      <div class="pf-stats"><span><b>${p.games}</b><small>Игр</small></span><span><b>${p.games ? Math.round((p.wins / p.games) * 100) : 0}%</b><small>Побед</small></span><span><b>${p.bestStreak}</b><small>Лучшая серия</small></span></div>
      ${p.registered ? html`<div class="pf-stats small"><span><b>${p.wins}</b><small>Выиграно</small></span><span><b>${p.draws ?? 0}</b><small>Вничью</small></span><span><b>${p.losses ?? 0}</b><small>Проиграно</small></span></div>` : null}
      ${editable ? html`<button class="navy-btn small" onClick=${() => openSheet({ kind: "edit" })}>Изменить профиль</button>` : null}
    </div>
    ${recovery ? html`<div class="info-card"><div class="ic-title"><${Icon} name="lock" size="15" style="color:#F6D482" /><b>Код восстановления</b></div>
      <p>Сохрани его: только он вернёт аккаунт, если забудешь пароль. Больше он не покажется.</p>
      <b class="recovery">${recovery}</b><button class="navy-btn small" onClick=${() => setRecovery(null)}>Сохранил</button></div>` : null}
    ${p.registered ? html`<${Friends} key=${friendsKey} open=${(id) => openSheet({ kind: "player", id })} />`
      : mode ? html`<form class="auth" onSubmit=${submit}>
          <h4 class="section">${mode === "login" ? "ВХОД" : "РЕГИСТРАЦИЯ"}</h4>
          <label class="pw-field"><${Icon} name="profile" size="16" /><input value=${nick} onInput=${(e) => setNick(e.target.value)} placeholder="Ник" autocomplete="username" autocapitalize="off" autocorrect="off" spellcheck="false" /></label>
          <label class="pw-field"><${Icon} name="lock" size="16" /><input type="password" value=${pw} onInput=${(e) => setPw(e.target.value)} placeholder="Пароль" autocomplete=${mode === "login" ? "current-password" : "new-password"} /></label>
          ${mode === "register" ? html`<p class="hint-line small pad">Ник — 3–20 латинских букв, цифр, «_» или «-». Пароль от 6 символов. Твои игры гостем останутся в аккаунте.</p>` : null}
          ${err ? html`<p class="hint-line small pad" style="color:#FF9AA8">${err}</p>` : null}
          <button class="primary-btn" type="submit" disabled=${busy || nick.trim().length < 3 || pw.length < 6}>${busy ? html`<span class="spinner"></span>` : mode === "login" ? "Войти" : "Создать аккаунт"}</button>
          <button class="text-btn muted" type="button" onClick=${() => { setMode(null); setErr(null); }}>Отмена</button>
        </form>`
      : html`<div class="two"><button class="primary-btn" onClick=${() => setMode("login")}>Войти</button><button class="navy-btn tall" onClick=${() => setMode("register")}>Регистрация</button></div>
        <p class="hint-line small pad">Тот же аккаунт, что на derbyo.online: рейтинг, уровень и друзья общие. Друзья и фото профиля — после входа.</p>
        <h4 class="section">ИМЯ ГОСТЯ</h4>
        <label class="pw-field"><input value=${guest} maxlength="24" onInput=${(e) => setGuest(e.target.value)} onBlur=${() => { const v = guest.trim(); if (v) account.guestName = v; else setGuest(account.name); }} /></label>`}
    <h4 class="section">НАСТРОЙКИ</h4>
    <${Settings} />
    ${p.registered ? html`<div class="settings-list">
      <button class="toggle-card press" onClick=${() => openSheet({ kind: "password" })}><span class="tc-ic"><${Icon} name="lock" size="18" weight="2" /></span>
        <span class="tc-t"><b>Сменить пароль</b><small>Нужен текущий пароль</small></span><${Icon} name="right" size="14" style="opacity:.4" /></button>
      <button class="navy-btn" disabled=${busy} onClick=${logout}>Выйти из аккаунта</button></div>` : null}
    ${err && !mode ? html`<p class="hint-line small pad" style="color:#FF9AA8">${err}</p>` : null}
    ${children}
  </div>
  ${sheet ? html`<${Panel} shut=${shut} onClose=${() => setSheet(null)}>
    ${sheet.kind === "edit" ? html`<${EditProfile} done=${() => setShut(true)} />`
      : sheet.kind === "password" ? html`<${ChangePassword} done=${() => setShut(true)} />`
      : html`<${PlayerCard} id=${sheet.id} onChange=${() => setFriendsKey((k) => k + 1)} />`}<//>` : null}
  </div>`;
}
