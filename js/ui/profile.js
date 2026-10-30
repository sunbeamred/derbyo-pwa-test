// A player's profile (port of ProfileSheet.swift): who they are, how strong, your record against them, and
// — for a human — friendship, report and block.
import { html, useState, useEffect, cx, img, Icon, Alert, rankTier, tierStyle, placeStyle, levelColor, flagView, vibrate } from "./common.js";
import { store } from "../model.js";
import { account, social as siteSocial, playerProfile } from "../net.js";

/** Friendship with a real player in an online match: the sandbox gives their profile id; the site is searched by nickname. */
function OnlineFriend({ m, owner, viewer, name, close }) {
  const [person, setPerson] = useState(undefined);
  const [busy, setBusy] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);
  useEffect(() => {
    let live = true;
    const id = viewer ? null : (owner === 0 ? m.me : m.them)?.card?.profileId;
    const find = id ? playerProfile(id) : siteSocial.search(name).then((list) => list.find((x) => x.nickname.toLowerCase() === name.toLowerCase()) ?? null);
    find.then((p) => live && setPerson(p ?? null)).catch(() => live && setPerson(null));
    return () => { live = false; };
  }, [name]);
  if (person === undefined) return html`<div class="pf-actions"><div class="settled"><span class="spinner muted"></span>Ищем игрока…</div></div>`;
  if (!person) return html`<div class="pf-actions"><div class="settled"><${Icon} name="profile" size="16" />Гость — в друзья только с аккаунтом</div></div>`;
  const act = async (action) => {
    setBusy(true);
    try { const r = await siteSocial.friend(person.id, action); setPerson({ ...person, relationship: r.relationship }); vibrate(10); } catch {}
    setBusy(false);
  };
  const rel = person.relationship;
  return html`<div class="pf-actions">
    ${rel === "none" ? html`<button class="green-btn press" disabled=${busy} onClick=${() => act("request")}><${Icon} name="friendAdd" size="17" />Добавить в друзья</button>`
      : rel === "incoming" ? html`<button class="green-btn press" disabled=${busy} onClick=${() => act("accept")}><${Icon} name="friendAdd" size="17" />Принять заявку</button>`
      : html`<div class="settled"><${Icon} name=${rel === "outgoing" ? "clock" : rel === "friends" ? "friends" : "hand"} size="16" />
          ${rel === "outgoing" ? "Заявка отправлена" : rel === "friends" ? "В друзьях" : "Заблокирован"}</div>`}
    ${rel === "outgoing" ? html`<div class="pf-quiet"><button disabled=${busy} onClick=${() => act("cancel")}>Отменить заявку</button></div>`
      : rel !== "blocked" ? html`<div class="pf-quiet"><button class="red" onClick=${() => setConfirmBlock(true)}>Заблокировать</button></div>`
      : html`<div class="pf-quiet"><button disabled=${busy} onClick=${() => act("unblock")}>Разблокировать</button></div>`}
    ${confirmBlock ? html`<${Alert} title=${`Заблокировать ${name}?`} message="Он не сможет звать тебя в друзья и приглашать в игру."
      onClose=${() => setConfirmBlock(false)}
      actions=${[{ title: "Отмена", run: () => setConfirmBlock(false) }, { title: "Заблокировать", kind: "destructive", run: () => { setConfirmBlock(false); act("block"); } }]} />` : null}
  </div>`;
}

export function ProfileSheet({ m, owner, viewer = null, close }) {
  const [confirmBlock, setConfirmBlock] = useState(false);
  const p = viewer ? m.viewerProfile(viewer) : m.profile(owner);
  // A spectator sees both players as other people: the left one is not «you».
  const other = !viewer && (owner === 1 || m.watching);
  const bot = !viewer && (owner === 1 ? m.opponent.isBot : m.watching && !!m.me?.bot);
  const red = m.seat(owner) === 0;
  // A spectator's own name is the account's, not the seat name the match shows on the left.
  const me = viewer === m.myName || (m.online && !!viewer && viewer === account.name);
  const social = !m.online && (viewer ? !me : owner === 1 && !bot);
  // Online: friends need your own account; not for yourself, a bot or the other phone's «Игрок 2».
  const onlineSocial = m.online && !m.hotseat && !!account.profile?.registered && (viewer ? !me : other && !bot && (owner === 0 ? m.me : m.them)?.card?.profileId !== account.profile?.id);
  const rel = m.relationWith(viewer);
  const act = (f) => () => { f(); store.changed(); };
  const t = rankTier(p.rating ?? 0);
  const h = !viewer && owner === 1 ? m.headToHead : null;
  const mine = m.mySeat === 0 ? "#FF5364" : "#32E5A1", theirs = m.mySeat === 0 ? "#32E5A1" : "#FF5364";
  return html`<div class="profile">
    <div class="pf-head">
      <span class=${cx("pf-avatar", viewer ? "neutral" : red ? "red" : "green")}>${bot ? html`<img src=${img("bot")} alt="" />` : p.photo ? html`<img class="photo" src=${p.photo} alt="" />` : p.name.slice(0, 2).toUpperCase()}</span>
      <span class="pf-name">
        <b>${p.name}</b>
        <span>${p.flag ? html`<i class="flag">${flagView(p.flag)}</i>` : null}
          ${bot ? html`<small>Бот для тренировки</small>` : p.level ? html`<em class="lvl" style=${`--c:${levelColor(p.level)}`}>Ур. ${p.level}</em>` : null}</span>
      </span>
      ${p.rating != null ? html`<span class="pf-rating">
        <b class="grad" style=${`${tierStyle(p.rating)};filter:drop-shadow(0 0 6px ${t.b}${Math.round(t.glow * 255).toString(16).padStart(2, "0")})`}>${p.rating}</b>
        ${p.rank ? html`<small><span class=${cx(placeStyle(p.rank) && "grad", p.rank <= 5 && "top")} style=${placeStyle(p.rank)}>${p.rank}</span> место в рейтинге</small>`
          : html`<small>${bot ? "фиксированный рейтинг" : "рейтинг"}</small>`}
      </span>` : m.online ? html`<span class="pf-rating"><small>${bot ? "бот" : owner === 0 && !m.watching ? "рейтинг после 5 игр с 2 соперниками" : "рейтинг на сайте"}</small></span>` : null}
    </div>
    ${!bot && p.games != null ? html`<div class="pf-stats">
      <span><b>${p.games}</b><small>Игр</small></span><span><b>${p.winRate}%</b><small>Побед</small></span><span><b>${p.bestStreak}</b><small>Лучшая серия</small></span></div>` : null}
    ${h ? html`<div class="h2h">
      <div><small>Ваши встречи</small><span class="sp"></span><b>${h.w} : ${h.l}</b>${h.d ? html`<em>ничьих ${h.d}</em>` : null}</div>
      <div class="h2h-bar"><i style=${`flex:${h.w};background:${mine}`}></i><i style=${`flex:${h.d};background:#4A5D70`}></i><i style=${`flex:${h.l};background:${theirs}`}></i></div>
    </div>` : null}
    ${social ? html`<div class="pf-actions">
      ${rel === "none" ? html`<button class="green-btn press" onClick=${act(() => m.sendFriendRequest(viewer))}><${Icon} name="friendAdd" size="17" />Добавить в друзья</button>`
        : rel === "incoming" ? html`<button class="green-btn press" onClick=${act(() => m.acceptFriend(viewer))}><${Icon} name="friendAdd" size="17" />Принять заявку</button>`
        : html`<div class="settled"><${Icon} name=${rel === "outgoing" ? "clock" : rel === "friends" ? "friends" : "hand"} size="16" />
            ${rel === "outgoing" ? "Заявка отправлена" : rel === "friends" ? "В друзьях" : "Заблокирован"}</div>`}
      ${rel !== "blocked" ? html`<div class="pf-quiet"><button onClick=${act(() => m.report())}>Пожаловаться</button>
        <button class="red" onClick=${() => setConfirmBlock(true)}>Заблокировать</button></div>` : null}
    </div>` : null}
    ${onlineSocial ? html`<${OnlineFriend} m=${m} owner=${owner} viewer=${viewer} name=${viewer ?? p.name} close=${close} />` : null}
    ${confirmBlock ? html`<${Alert} title=${`Заблокировать ${p.name}?`} message="Его сообщения скроются, в друзья он не сможет позвать."
      onClose=${() => setConfirmBlock(false)}
      actions=${[{ title: "Отмена", run: () => setConfirmBlock(false) }, { title: "Заблокировать", kind: "destructive", run: () => { setConfirmBlock(false); m.block(viewer); store.changed(); close(); } }]} />` : null}
  </div>`;
}
