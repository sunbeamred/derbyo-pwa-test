// The «Рейтинг» and «Профиль» tabs on the site's data: the leaderboard, your account (guest, login, register).
import { html, useState, useEffect, cx, Icon, rankTier, tierStyle, placeStyle, levelColor } from "./common.js";
import { account, leaderboard, playerProfile } from "../net.js";
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
          <span class="lb-name"><b>${e.nickname}</b><small>${e.games} игр · ${e.winRate}% побед</small></span>
          <b class="lb-pts grad num" style=${tierStyle(e.rating ?? 0)}>${period === "week" ? (e.points > 0 ? "+" : "") + e.points : e.rating}</b>
        </button>`)}</div>
        <p class="hint-line small center">${data.total} игроков в рейтинге · рейтинг после 5 игр с двумя разными соперниками</p>`}
  </div>
  ${open ? html`<${Panel} onClose=${() => setOpen(null)}><${PlayerCard} id=${open} /><//>` : null}
  </div>`;
}

/** A registered player's public card from the site. */
function PlayerCard({ id }) {
  const [p, setP] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => { playerProfile(id).then(setP).catch((e) => setErr(e.message)); }, [id]);
  if (err) return html`<div class="profile"><p class="hint-line">${err}</p></div>`;
  if (!p) return html`<div class="profile"><p class="hint-line">Загружаем…</p></div>`;
  const t = rankTier(p.rating ?? 0);
  const h = p.headToHead;
  return html`<div class="profile">
    <div class="pf-head">
      <span class="pf-avatar neutral">${p.nickname.slice(0, 2).toUpperCase()}</span>
      <span class="pf-name"><b>${p.nickname}</b><span><em class="lvl" style=${`--c:${levelColor(p.level)}`}>Ур. ${p.level}</em>
        ${p.presence ? html`<small>${{ online: "в сети", in_match: "в матче", offline: "не в сети" }[p.presence]}</small>` : null}</span></span>
      <span class="pf-rating">${p.rating != null ? html`<b class="grad" style=${`${tierStyle(p.rating)};filter:drop-shadow(0 0 6px ${t.b}80)`}>${p.rating}</b><small>${t.name}</small>`
        : html`<small>калибровка</small>`}</span>
    </div>
    <div class="pf-stats"><span><b>${p.games}</b><small>Игр</small></span><span><b>${p.winRate}%</b><small>Побед</small></span><span><b>${p.bestStreak}</b><small>Лучшая серия</small></span></div>
    ${h && h.games ? html`<div class="h2h"><div><small>Ваши встречи</small><span class="sp"></span><b>${h.wins} : ${h.losses}</b>${h.draws ? html`<em>ничьих ${h.draws}</em>` : null}</div></div>` : null}
  </div>`;
}

/** Your account: a guest name, or the site's login and registration; your numbers once you play. */
export function ProfileTab({ children }) {
  const p = account.profile;
  const [mode, setMode] = useState(null);
  const [nick, setNick] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [recovery, setRecovery] = useState(null);
  const [guest, setGuest] = useState(account.name);
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
  return html`<div class="screen-scroll"><div class="page">
    <h1 class="big-title">Профиль</h1>
    <div class="profile glass account-card">
      <div class="pf-head">
        <span class="pf-avatar neutral">${(account.name || "?").slice(0, 2).toUpperCase()}</span>
        <span class="pf-name"><b>${account.name}</b><span><em class="lvl" style=${`--c:${levelColor(p.level)}`}>Ур. ${p.level}</em><small>${p.registered ? "аккаунт derbyo.online" : "гость"}</small></span></span>
        <span class="pf-rating">${p.rating != null ? html`<b class="grad" style=${`${tierStyle(p.rating)};filter:drop-shadow(0 0 6px ${t.b}80)`}>${p.rating}</b>
          <small>${p.rank ? html`<span class=${cx(placeStyle(p.rank) && "grad")} style=${placeStyle(p.rank)}>${p.rank}</span> место` : t.name}</small>`
          : html`<small>${p.registered ? "рейтинг после 5 игр" : "рейтинг — после входа"}</small>`}</span>
      </div>
      <div class="pf-stats"><span><b>${p.games}</b><small>Игр</small></span><span><b>${p.games ? Math.round((p.wins / p.games) * 100) : 0}%</b><small>Побед</small></span><span><b>${p.bestStreak}</b><small>Лучшая серия</small></span></div>
    </div>
    ${recovery ? html`<div class="info-card"><div class="ic-title"><${Icon} name="lock" size="15" style="color:#F6D482" /><b>Код восстановления</b></div>
      <p>Сохрани его: только он вернёт аккаунт, если забудешь пароль. Больше он не покажется.</p>
      <b class="recovery">${recovery}</b><button class="navy-btn small" onClick=${() => setRecovery(null)}>Сохранил</button></div>` : null}
    ${p.registered ? html`<button class="navy-btn" disabled=${busy} onClick=${logout}>Выйти из аккаунта</button>`
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
        <p class="hint-line small pad">Тот же аккаунт, что на derbyo.online: рейтинг, уровень и друзья общие.</p>
        <h4 class="section">ИМЯ ГОСТЯ</h4>
        <label class="pw-field"><input value=${guest} maxlength="24" onInput=${(e) => setGuest(e.target.value)} onBlur=${() => { const v = guest.trim(); if (v) account.guestName = v; else setGuest(account.name); }} /></label>`}
    ${err && !mode ? html`<p class="hint-line small pad" style="color:#FF9AA8">${err}</p>` : null}
    ${children}
  </div></div>`;
}
