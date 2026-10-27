// A player's profile (port of ProfileSheet.swift): who they are, how strong, your record against them, and
// — for a human — friendship, report and block.
import { html, useState, cx, img, Icon, Alert, rankTier, tierStyle, placeStyle, levelColor } from "./common.js";
import { store } from "../model.js";

export function ProfileSheet({ m, owner, viewer = null, close }) {
  const [confirmBlock, setConfirmBlock] = useState(false);
  const p = viewer ? m.viewerProfile(viewer) : m.profile(owner);
  const bot = !viewer && owner === 1 && m.opponent.isBot;
  const red = m.seat(owner) === 0;
  const me = viewer === m.myName;
  const social = viewer ? !me : owner === 1 && !bot;
  const rel = m.relationWith(viewer);
  const act = (f) => () => { f(); store.changed(); };
  const t = rankTier(p.rating);
  const h = !viewer && owner === 1 ? m.headToHead : null;
  const mine = m.mySeat === 0 ? "#FF5364" : "#32E5A1", theirs = m.mySeat === 0 ? "#32E5A1" : "#FF5364";
  return html`<div class="profile">
    <div class="pf-head">
      <span class=${cx("pf-avatar", viewer ? "neutral" : red ? "red" : "green")}>${bot ? html`<img src=${img("bot")} alt="" />` : p.name.slice(0, 2).toUpperCase()}</span>
      <span class="pf-name">
        <b>${p.name}</b>
        <span>${p.flag ? html`<i class="flag">${p.flag}</i>` : null}
          ${bot ? html`<small>Бот для тренировки</small>` : p.level ? html`<em class="lvl" style=${`--c:${levelColor(p.level)}`}>Ур. ${p.level}</em>` : null}</span>
      </span>
      <span class="pf-rating">
        <b class="grad" style=${`${tierStyle(p.rating)};filter:drop-shadow(0 0 6px ${t.b}${Math.round(t.glow * 255).toString(16).padStart(2, "0")})`}>${p.rating}</b>
        ${p.rank ? html`<small><span class=${cx(placeStyle(p.rank) && "grad", p.rank <= 5 && "top")} style=${placeStyle(p.rank)}>${p.rank}</span> место в рейтинге</small>`
          : html`<small>фиксированный рейтинг</small>`}
      </span>
    </div>
    ${!bot ? html`<div class="pf-stats">
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
    ${confirmBlock ? html`<${Alert} title=${`Заблокировать ${p.name}?`} message="Его сообщения скроются, в друзья он не сможет позвать."
      onClose=${() => setConfirmBlock(false)}
      actions=${[{ title: "Отмена", run: () => setConfirmBlock(false) }, { title: "Заблокировать", kind: "destructive", run: () => { setConfirmBlock(false); m.block(viewer); store.changed(); close(); } }]} />` : null}
  </div>`;
}
