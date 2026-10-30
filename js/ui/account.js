// The «Рейтинг» and «Профиль» tabs on the site's data: the leaderboard; your account (guest, login, register),
// its photo and country (sandbox), friends, password and the phone's settings.
import { html, useState, useEffect, useRef, cx, img, Icon, rankTier, tierStyle, placeStyle, levelColor, Prefs, vibrate, flagView } from "./common.js";
import { account, leaderboard, playerProfile, social } from "../net.js";
import { Sound } from "../sound.js";
import { flagOf, flagOrGlobe } from "../online.js";
import { Panel } from "./common.js";
import { notifications, PUSH_KINDS } from "../push.js";

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
          <b class=${cx("lb-place num", placeStyle(e.rank) && "grad")} style=${placeStyle(e.rank)}>#${e.rank}</b>
          <${Face} name=${e.nickname} photo=${e.avatar} small=${true} /><span class="lb-name"><b>${flagOrGlobe(e.country) ? html`<i class="flag">${flagView(flagOrGlobe(e.country))}</i> ` : null}${e.nickname}</b><small>${e.games} игр · ${e.winRate}% побед</small></span>
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
      <span class="pf-name"><b>${p.nickname}</b><span>${flagOrGlobe(p.country) ? html`<i class="flag">${flagView(flagOrGlobe(p.country))}</i>` : null}<em class="lvl" style=${`--c:${levelColor(p.level)}`}>Ур. ${p.level}</em>
        ${p.presence ? html`<small>${PRESENCE[p.presence]}</small>` : null}</span></span>
      <span class="pf-rating">${p.rating != null ? html`<b class="grad" style=${`${tierStyle(p.rating)};filter:drop-shadow(0 0 6px ${t.b}80)`}>${p.rating}</b><small>${p.rank ? html`<${Place} n=${p.rank} />` : t.name}</small>`
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
  // A call to a game: the friend gets it in the app and as a push; accepting opens a closed room for the two.
  const call = async (id) => { setErr(null); try { await social.invite(id); vibrate(10); load(); } catch (x) { setErr(x.message); } };
  const invitation = async (i, action) => { setErr(null); try { await takeInvite(i, action); load(); } catch (x) { setErr(x.message); load(); } };
  const row = (p, side) => html`<div class="fr-row">
    <button class="fr-who press" onClick=${() => open(p.id, load)}><${Face} name=${p.nickname} photo=${p.avatar} small=${true} />
      <span class="lb-name"><b>${flagOrGlobe(p.country) ? html`<i class="flag">${flagView(flagOrGlobe(p.country))}</i> ` : null}${p.nickname}</b>
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
    ${st.invites?.length ? html`<h4 class="section">ПРИГЛАШЕНИЯ В ИГРУ</h4><div class="board-list glass">${st.invites.map((i) => html`<div class="fr-row invite-row">
      <span class="lb-name"><b>${i.nickname}</b><small>${i.status === "accepted" ? "комната готова" : i.direction === "incoming" ? "зовёт сыграть" : "ждём ответа"}</small></span>
      ${i.status === "accepted" ? html`<button class="chip-btn press" onClick=${() => invitation(i, "go")}>Зайти</button>`
        : i.direction === "incoming" ? html`<span class="fr-btns">
          <button class="round-ok press" aria-label="Принять" onClick=${() => invitation(i, "go")}><${Icon} name="check" size="16" weight="2.5" /></button>
          <button class="round-no press" aria-label="Отклонить" onClick=${() => invitation(i, "decline")}><${Icon} name="x" size="14" weight="2.5" /></button></span>`
        : html`<button class="text-btn muted" onClick=${() => invitation(i, "cancel")}>Отменить</button>`}</div>`)}</div>` : null}
    <h4 class="section">ДРУЗЬЯ · ${st.friends.length}</h4>
    ${st.friends.length ? html`<div class="board-list glass">${st.friends.map((p) => row(p, st.invites?.some((i) => i.nickname === p.nickname) ? html`<${Icon} name="right" size="14" style="opacity:.4" />`
      : html`<button class="chip-btn press" onClick=${() => call(p.id)}><img src=${img("invite")} alt="" />Позвать</button>`))}</div>`
      : html`<p class="hint-line small pad">Пока никого. Найди друга по нику или открой профиль соперника после матча.</p>`}
    ${st.outgoing.length ? html`<h4 class="section">ОТПРАВЛЕННЫЕ</h4><div class="board-list glass">${st.outgoing.map((p) => row(p,
      html`<button class="text-btn muted" onClick=${() => answer(p.id, "cancel")}>Отменить</button>`))}</div>` : null}
    ${err ? html`<p class="hint-line small pad" style="color:#FF9AA8">${err}</p>` : null}`;
}

// The flag comes from the phone's time zone (the region of its language as a fallback); there is no country picker.
const ZONES = { KZ: ["Almaty", "Qostanay", "Aqtobe", "Aqtau", "Atyrau", "Oral", "Qyzylorda"], UZ: ["Tashkent", "Samarkand"], KG: ["Bishkek"], TJ: ["Dushanbe"],
  TM: ["Ashgabat"], AZ: ["Baku"], AM: ["Yerevan"], GE: ["Tbilisi"], BY: ["Minsk"], UA: ["Kyiv", "Kiev"], MD: ["Chisinau"], TR: ["Istanbul"],
  RU: ["Moscow", "Kaliningrad", "Samara", "Volgograd", "Saratov", "Ulyanovsk", "Astrakhan", "Kirov", "Yekaterinburg", "Omsk", "Novosibirsk", "Barnaul", "Tomsk",
    "Novokuznetsk", "Krasnoyarsk", "Irkutsk", "Chita", "Yakutsk", "Vladivostok", "Sakhalin", "Magadan", "Srednekolymsk", "Kamchatka", "Anadyr"] };
export function homeCountry() {
  try {
    const city = Intl.DateTimeFormat().resolvedOptions().timeZone?.split("/").pop();
    for (const [c, list] of Object.entries(ZONES)) if (list.includes(city)) return c;
  } catch {}
  const region = (navigator.language || "").split("-")[1]?.toUpperCase();
  return /^[A-Z]{2}$/.test(region ?? "") ? region : null;
}

/** «#12», a top-five place in its own colour. */
const Place = ({ n }) => html`<span class=${cx(placeStyle(n) && "grad")} style=${placeStyle(n)}>#${n}</span>`;

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

/** Sound and vibration, kept on this phone. */
function Settings() {
  const [, redraw] = useState(0);
  const row = (icon, title, detail, on, set) => html`<label class="toggle-card">
    <span class="tc-ic">${icon}</span>
    <span class="tc-t"><b>${title}</b><small>${detail}</small></span>
    <input type="checkbox" class="switch" checked=${on} onClick=${(e) => { set(e.target.checked); redraw((n) => n + 1); }} /></label>`;
  return html`<div class="settings-list">
    ${row(html`<img src=${img("sound")} alt="" />`, "Звук", "Ходы, таймер, победа", Sound.enabled, (v) => { Sound.enabled = v; if (v) Sound.play("turn"); })}
    ${row(html`<img src=${img("vibrate")} alt="" />`, "Вибрация", "Отклик на нажатия и ходы", Prefs.vibration, (v) => { Prefs.vibration = v; vibrate(15); })}
    ${account.profile && "showFlag" in account.profile ? html`<${NotifyRow} />` : null}
    ${location.pathname.startsWith("/app/") ? html`<a class="toggle-card press full-site" href="/full">
      <span class="tc-ic"><${Icon} name="home" size="18" weight="2" /></span>
      <span class="tc-t"><b>Полная версия сайта</b><small>derbyo.online как на компьютере</small></span>
      <${Icon} name="right" size="13" weight="3" class="chev" /></a>` : null}
  </div>`;
}

/** Notifications: one switch, and a pencil that picks which kinds come. */
function NotifyRow() {
  const [on, setOn] = useState(null);
  const [err, setErr] = useState(null);
  const [edit, setEdit] = useState(false);
  const [shut, setShut] = useState(false);
  const check = () => notifications.enabled().then(setOn).catch(() => setOn(false));
  useEffect(() => { check(); const off = notifications.onChange(check); const back = () => document.hidden || check();
    document.addEventListener("visibilitychange", back); return () => { off(); document.removeEventListener("visibilitychange", back); }; }, []);
  // Pushes belong to an account: a guest sees the row and how to get them.
  const guest = !account.profile?.registered;
  const supported = !guest && notifications.supported(), denied = notifications.permission() === "denied", prefs = notifications.prefs;
  const kinds = PUSH_KINDS.filter(([k]) => prefs[k]).map(([, t]) => t);
  const detail = guest ? "Появятся после регистрации" : !supported ? "Работают в приложении с экрана «Домой»" : denied ? "Запрещены: разреши их для DERBYO в настройках браузера или телефона"
    : on ? (kinds.length ? kinds.join(" · ") : "Все виды выключены") : "Приглашения в игру и заявки в друзья";
  const flip = async (v) => {
    setErr(null); setOn(v);
    try { if (v) await notifications.enable(); else await notifications.disable(); vibrate(10); } catch (e) { setErr(e.message); }
    check();
  };
  return html`<div class=${cx("toggle-card notify-row", guest && "off")} aria-disabled=${guest}>
      <span class="tc-ic"><img src=${img("bell")} alt="" /></span>
      <span class="tc-t"><b>Уведомления</b><small>${err ?? detail}</small></span>
      ${on ? html`<button class="pencil-btn press" aria-label="Выбрать уведомления" onClick=${() => { setShut(false); setEdit(true); }}><${Icon} name="pencil" size="16" weight="2" /></button>` : null}
      ${guest ? html`<input type="checkbox" class="switch" aria-label="Уведомления" checked=${false} disabled />`
        : supported && !denied ? html`<input type="checkbox" class="switch" aria-label="Уведомления" checked=${!!on} disabled=${on === null} onClick=${(e) => flip(e.target.checked)} />` : null}
    </div>
    ${edit ? html`<${Panel} shut=${shut} onClose=${() => setEdit(false)}><${NotifyKinds} /><//>` : null}`;
}

function NotifyKinds() {
  const [p, setP] = useState(notifications.prefs);
  const [err, setErr] = useState(null);
  const set = (k, v) => { const n = { ...p, [k]: v }; setP(n); notifications.setPrefs(n).catch((e) => setErr(e.message)); };
  return html`<div class="profile notify-kinds">
    <h3 class="sheet-title">Уведомления</h3>
    <div class="settings-list">${PUSH_KINDS.map(([k, t, d]) => html`<label class="toggle-card">
      <span class="tc-t"><b>${t}</b><small>${d}</small></span>
      <input type="checkbox" class="switch" checked=${p[k]} onClick=${(e) => set(k, e.target.checked)} /></label>`)}</div>
    ${err ? html`<p class="hint-line small pad" style="color:#FF9AA8">${err}</p>` : null}
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
  const file = useRef();
  // The plus on the photo opens the phone's gallery; the chosen photo is cropped and saved at once.
  const pickPhoto = async (e) => {
    const f = e.target.files?.[0]; e.target.value = "";
    if (!f) return;
    setBusy(true); setErr(null);
    try { await account.send("profile", { avatar: await squarePhoto(f) }); vibrate(10); } catch (x) { setErr(x.message); }
    setBusy(false);
  };
  const saveFlag = (v) => account.send("profile", v ? { showFlag: true, ...(p.country ? {} : { country: homeCountry() }) } : { showFlag: false })
    .then(() => vibrate(10)).catch((x) => setErr(x.message));
  const dropPhoto = async () => { setBusy(true); try { await account.send("profile", { avatar: null }); } catch (x) { setErr(x.message); } setBusy(false); };
  // A new account's flag: the country is taken from the phone once, while the flag is on.
  useEffect(() => {
    if (p?.registered && p.showFlag && !p.country && homeCountry()) account.send("profile", { country: homeCountry() }).catch(() => {});
  }, [p?.id, p?.showFlag]);
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
  const logout = async () => { setBusy(true); try { await notifications.forget(); await account.send("logout", {}); } catch (x) { setErr(x.message); } setBusy(false); };
  if (!account.ready) return html`<div class="screen-scroll"><div class="page"><h1 class="big-title">Профиль</h1><p class="hint-line pad">Соединяемся с derbyo.online…</p>${children}</div></div>`;
  const t = rankTier(p.rating ?? 0);
  const editable = p.registered && "avatar" in p;
  return html`<div class="screen-scroll"><div class="page">
    <h1 class="big-title">Профиль</h1>
    <div class="profile glass account-card">
      <div class="pf-head">
        ${editable ? html`<button class="face-btn press" disabled=${busy} aria-label=${p.avatar ? "Сменить фото" : "Добавить фото"} onClick=${() => file.current.click()}><${Face} name=${account.name} photo=${p.avatar} /><span class="face-edit"><${Icon} name="camera" size="15" /></span></button>
          <input ref=${file} type="file" accept="image/*" hidden onChange=${pickPhoto} />`
          : html`<${Face} name=${account.name} photo=${p.avatar} />`}
        <span class="pf-name"><b>${account.name}</b><span>${p.showFlag === false ? html`<i class="flag">${flagView("🌐")}</i>` : flagOrGlobe(p.country) ? html`<i class="flag">${flagView(flagOrGlobe(p.country))}</i>` : null}<em class="lvl" style=${`--c:${levelColor(p.level)}`}>Ур. ${p.level}</em>${p.registered ? null : html`<small>гость</small>`}</span></span>
        <span class="pf-rating">${p.rating != null ? html`<b class="grad" style=${`${tierStyle(p.rating)};filter:drop-shadow(0 0 6px ${t.b}80)`}>${p.rating}</b>
          <small>${p.rank ? html`<${Place} n=${p.rank} />` : t.name}</small>`
          : html`<small>${p.registered ? "рейтинг после 5 игр с 2 соперниками" : "рейтинг — после входа"}</small>`}</span>
      </div>
      <div class="pf-stats"><span><b>${p.games}</b><small>Игр</small></span><span><b>${p.games ? Math.round((p.wins / p.games) * 100) : 0}%</b><small>Побед</small></span><span><b>${p.bestStreak}</b><small>Лучшая серия</small></span></div>
      ${p.registered ? html`<div class="pf-stats small"><span><b>${p.wins}</b><small>Выиграно</small></span><span><b>${p.draws ?? 0}</b><small>Вничью</small></span><span><b>${p.losses ?? 0}</b><small>Проиграно</small></span></div>` : null}
      ${editable && "showFlag" in p ? html`<label class="flag-row">
        <i class="flag">${flagView(p.showFlag ? flagOf(p.country ?? homeCountry()) ?? "🌐" : "🌐")}</i>
        <span><b>Мой флаг</b><small>${p.showFlag ? "Другие игроки видят флаг твоей страны" : "Другие видят планету вместо флага"}</small></span>
        <input type="checkbox" class="switch" checked=${p.showFlag} onClick=${(e) => saveFlag(e.target.checked)} /></label>` : null}
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
      <button class="toggle-card press" onClick=${() => openSheet({ kind: "password" })}><span class="tc-ic"><img src=${img("key")} alt="" /></span>
        <span class="tc-t"><b>Сменить пароль</b><small>Нужен текущий пароль</small></span><${Icon} name="right" size="14" style="opacity:.4" /></button>
      ${editable && p.avatar ? html`<button class="text-btn muted" disabled=${busy} onClick=${dropPhoto}>Убрать фото профиля</button>` : null}
      <button class="navy-btn" disabled=${busy} onClick=${logout}>Выйти из аккаунта</button></div>` : null}
    ${err && !mode ? html`<p class="hint-line small pad" style="color:#FF9AA8">${err}</p>` : null}
    ${children}
  </div>
  ${sheet ? html`<${Panel} shut=${shut} onClose=${() => setSheet(null)}>
    ${sheet.kind === "password" ? html`<${ChangePassword} done=${() => setShut(true)} />`
      : html`<${PlayerCard} id=${sheet.id} onChange=${() => setFriendsKey((k) => k + 1)} />`}<//>` : null}
  </div>`;
}

/** Opens a friend's invitation: accepting (or the sender, once accepted) gets a seat; the app opens that room. */
export async function takeInvite(i, action = "go") {
  if (action !== "go") { await social.invitation(i.id, action); return; }
  const r = await social.invitation(i.id, i.direction === "incoming" && i.status !== "accepted" ? "accept" : "claim");
  if (r.session) dispatchEvent(new CustomEvent("derbyo-session", { detail: r.session }));
}
