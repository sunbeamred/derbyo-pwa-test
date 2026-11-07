// Friends where you play (owner, 2026-11-07): «Позвать друга» from the room you made, and the friends online
// over the games on «Играть». The full list (requests, search) stays in the profile.
import { html, useState, useEffect, cx, img, Icon } from "./common.js";
import { social, account } from "../net.js";
import { invites, secondsLeft } from "../invites.js";
import { Face } from "./account.js";

const PRESENCE = { online: "в сети", in_match: "в игре", in_minigame: "в мини-игре", offline: "не в сети" };

/** The site's friends, looked up again every 15 s while shown (and at once when the app comes back). */
function useFriends() {
  const [st, setSt] = useState(null);
  useEffect(() => {
    if (!account.profile?.registered) return;
    let live = true;
    const load = () => { if (!document.hidden) social.state().then((v) => live && setSt(v)).catch(() => {}); };
    load();
    const t = setInterval(load, 15000);
    document.addEventListener("visibilitychange", load);
    return () => { live = false; clearInterval(t); document.removeEventListener("visibilitychange", load); };
  }, [account.profile?.id, account.profile?.registered]);
  return st;
}

/** Calls change by the second: the shared poll, redrawn every second while one is open. */
function useCalls() {
  const [calls, setCalls] = useState(invites.list);
  useEffect(() => {
    const off = invites.on(setCalls);
    const t = setInterval(() => setCalls(invites.list.filter((i) => i.expires > Date.now())), 1000);
    return () => { off(); clearInterval(t); };
  }, []);
  return calls;
}

/** «Позвать в комнату»: friends by where they are; a call puts them in this room's free seat. */
export function RoomFriends({ code, share }) {
  const st = useFriends();
  const calls = useCalls();
  const [q, setQ] = useState("");
  const [err, setErr] = useState(null);
  const room = String(code || "").replace(/\s/g, "");
  if (!account.profile?.registered) return html`<div class="rf">
    <h3 class="rf-title">Позвать в комнату</h3>
    <p class="hint-line small">Друзья — после входа в аккаунт. Пока можно отправить ссылку.</p>
    <button class="navy-btn press" onClick=${share}><${Icon} name="share" size="16" />Поделиться ссылкой</button></div>`;
  const call = async (id) => { setErr(null); try { await social.inviteRoom(id, room); invites.refresh(); } catch (x) { setErr(x.message); } };
  const side = (p) => {
    const i = calls.find((x) => x.friend === p.id && x.game === "room" && x.code === room);
    if (i?.status === "accepted") return html`<span class="chip-btn go">Принял</span>`;
    if (i) return html`<span class="chip-btn invited"><span class="spinner"></span>Приглашён · ${secondsLeft(i)}</span>`;
    if (p.presence === "in_match" || p.presence === "in_minigame") return html`<span class="rf-busy">Играет</span>`;
    return html`<button class="chip-btn press" onClick=${() => call(p.id)}><img src=${img("invite")} alt="" />Позвать</button>`;
  };
  const list = (st?.friends ?? []).filter((p) => !q.trim() || p.nickname.toLowerCase().includes(q.trim().toLowerCase()));
  const group = (title, people) => people.length ? html`<h4 class="section">${title} · ${people.length}</h4>
    <div class="board-list glass">${people.map((p) => html`<div class="fr-row">
      <span class="fr-who"><${Face} name=${p.nickname} photo=${p.avatar} small=${true} />
        <span class="lb-name"><b>${p.nickname}</b>
          <small class=${cx("pres-" + p.presence)}>${PRESENCE[p.presence] ?? ""}</small></span></span>
      ${side(p)}</div>`)}</div>` : null;
  return html`<div class="rf">
    <h3 class="rf-title">Позвать в комнату</h3>
    ${(st?.friends?.length ?? 0) > 6 ? html`<label class="pw-field"><${Icon} name="search" size="16" /><input value=${q} onInput=${(e) => setQ(e.target.value)}
      placeholder="Найти по нику" autocapitalize="off" autocorrect="off" spellcheck="false" /></label>` : null}
    ${!st ? html`<p class="hint-line pad">Загружаем друзей…</p>`
      : !st.friends.length ? html`<p class="hint-line small pad">Друзей пока нет. Добавить можно в профиле или в профиле соперника после матча.</p>`
      : html`${group("ОНЛАЙН", list.filter((p) => p.presence === "online"))}
        ${group("В ИГРЕ", list.filter((p) => p.presence === "in_match" || p.presence === "in_minigame"))}
        ${group("НЕ В СЕТИ", list.filter((p) => p.presence === "offline" || !p.presence))}`}
    ${err ? html`<p class="hint-line small pad" style="color:#FF9AA8">${err}</p>` : null}
    <button class="navy-btn press rf-share" onClick=${share}><${Icon} name="share" size="16" />Поделиться ссылкой</button>
  </div>`;
}

/** Friends online over the games on «Играть»: a tap offers a match, the stands, or the full list in the profile. Hidden with nobody on. */
export function FriendsStrip() {
  const st = useFriends();
  const calls = useCalls();
  const [pick, setPick] = useState(null);
  const [err, setErr] = useState(null);
  // Many friends (owner, 2026-11-07): the 10 most useful — free to call first, then those in a match (to watch),
  // the ones you played last first in each — and «+N» opens the full list in the profile.
  const rank = (p) => (p.presence === "online" ? 0 : 1);
  const on = (st?.friends ?? []).filter((p) => p.presence && p.presence !== "offline")
    .sort((a, b) => rank(a) - rank(b) || (b.played || 0) - (a.played || 0));
  if (!on.length) return null;
  const MAX = 10, shown = on.length > MAX ? on.slice(0, MAX - 1) : on, more = on.length - shown.length;
  const call = async (p) => { setErr(null); try { await social.invite(p.id); invites.refresh(); setPick(null); } catch (x) { setErr(x.message); } };
  const calling = (p) => calls.find((i) => i.friend === p.id && i.direction === "outgoing" && i.game !== "room" && i.game !== "contexto");
  return html`<div class="fs">
    <h4 class="section">ДРУЗЬЯ ОНЛАЙН · ${on.length}</h4>
    <div class="fs-row">${shown.map((p) => html`<button class=${cx("fs-one press", pick?.id === p.id && "on")} onClick=${() => { setErr(null); setPick(pick?.id === p.id ? null : p); }}>
      <span class=${cx("fs-av", "pres-" + p.presence)}><${Face} name=${p.nickname} photo=${p.avatar} small=${true} /><i></i></span>
      <small>${p.nickname}</small></button>`)}
      ${more ? html`<button class="fs-one fs-more press" onClick=${() => { setPick(null); dispatchEvent(new CustomEvent("derbyo-friends")); }}>
        <span class="fs-av"><b>+${more}</b></span><small>Все</small></button>` : null}</div>
    ${pick ? html`<div class="fs-menu glass">
      <b>${pick.nickname}</b><small>${PRESENCE[pick.presence] ?? ""}</small>
      <div class="fs-acts">
        ${pick.presence === "online" ? (calling(pick) ? html`<span class="chip-btn invited"><span class="spinner"></span>Приглашён · ${secondsLeft(calling(pick))}</span>`
          : html`<button class="chip-btn press go" disabled=${invites.busy} onClick=${() => call(pick)}><img src=${img("invite")} alt="" />Позвать в матч</button>`) : null}
        ${pick.watch ? html`<button class="chip-btn press" onClick=${() => { dispatchEvent(new CustomEvent("derbyo-watch", { detail: pick.watch })); setPick(null); }}><img src=${img("eye")} alt="" />Смотреть</button>` : null}
        <button class="chip-btn press" onClick=${() => { dispatchEvent(new CustomEvent("derbyo-friends")); setPick(null); }}>Все друзья</button>
      </div>
      ${err ? html`<p class="hint-line small" style="color:#FF9AA8">${err}</p>` : null}
    </div>` : null}
  </div>`;
}
