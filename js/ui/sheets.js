// The panels over the match (port of AnswerSheet.swift).
import { html, useState, useEffect, useRef, cx, img, Icon } from "./common.js";
import { byId, search, has } from "../data.js";
import { photoOf } from "../net.js";
import { initials } from "../online.js";
import { store, Hints, clueFacts, clueMask, MAX_VIEWERS } from "../model.js";
import { TurnDial, ConditionIcon } from "./match.js";

export function Face({ p, size }) {
  const src = p.wp !== undefined ? photoOf(p) : p.photo;
  return html`<span class="face-circle" style=${`--s:${size}px`}>
    ${src ? html`<img src=${src} alt="" />` : html`<span style=${`font-size:${size * 0.32}px`}>${p.initials ?? initials(p.name)}</span>`}</span>`;
}

/** The answer panel, built for one thumb: field at the bottom, what it needs right above it, the cell on top.
 * Picking a player never answers by itself (a site invariant). */
export function AnswerSheet({ m, cell, dismiss }) {
  const [query, setQuery] = useState(has("demoQuery") ? "Mo" : has("demoLastMove") ? "Henry" : has("demoMismatch") ? "Kaka" : "");
  const [picked, setPicked] = useState(null);
  const [scoutOpen, setScoutOpen] = useState(false);
  const field = useRef();
  const wrap = useRef();
  const col = m.cols[cell % 3], row = m.rows[Math.floor(cell / 3)];
  const clue = m.sharedClues[cell];
  const [found, setFound] = useState([]);
  const [busy, setBusy] = useState(false);
  // On the site the search is the server's, over the whole base; a pause in typing sends it.
  useEffect(() => {
    if (!m.online) return;
    const q = query.trim();
    if (q.length < 2 || picked?.name === query) { setFound([]); return; }
    let live = true;
    const t = setTimeout(() => m.search(q).then((r) => live && setFound(r)).catch(() => {}), 180);
    return () => { live = false; clearTimeout(t); };
  }, [query]);

  useEffect(() => { field.current?.focus({ preventScroll: true }); }, []);
  // Short lists sit on the bottom row, long ones start scrolled to it.
  useEffect(() => { const el = wrap.current; if (el) el.scrollTop = el.scrollHeight; });

  const type = (q) => { setQuery(q); if (q && q !== picked?.name) { setPicked(null); setScoutOpen(false); } };
  const choose = (p) => { setPicked(p); setQuery(p.name); field.current?.focus({ preventScroll: true }); };
  const shake = () => field.current?.parentElement?.animate([{ transform: "translateX(0)" }, { transform: "translateX(8px)" }, { transform: "translateX(-8px)" }, { transform: "translateX(5px)" }, { transform: "none" }], { duration: 300 });
  const submit = async (e) => {
    e?.preventDefault();
    if (!picked || busy) return;
    setBusy(true);
    const r = await m.answer(picked);
    setBusy(false);
    if (r === "used" || r === "unknown") shake();
    else if (r === "mismatch") field.current?.blur();
    else if (r === "review") dismiss();
    else if (r === "choices") { setPicked(null); setQuery(""); }
    store.changed();
  };

  const choices = m.online && m.choices?.cell === cell ? m.choices.candidates.map((c) => ({ ...c, born: c.birthYear, initials: initials(c.name) })) : null;
  const hits = choices ?? (query.length >= 2 && picked?.name !== query ? (m.online ? found : search(query)) : []);
  const mm = m.mismatch?.cell === cell ? m.mismatch : null;
  let body;
  if (mm) body = html`<${MismatchCard} m=${m} mm=${mm} cancel=${() => { m.cancelMismatch(); setPicked(null); setQuery(""); store.changed(); setTimeout(() => field.current?.focus(), 0); }}
    ask=${() => { m.requestReview(); store.changed(); dismiss(); }} />`;
  else if (scoutOpen) body = html`<${ScoutChoices} m=${m} cell=${cell} clue=${clue}
    bought=${(h) => { setScoutOpen(false); if (h === "four") { setPicked(null); setQuery(""); } }} />`;
  else if (choices) body = html`<p class="hint-line small">${m.choices.text ?? "Тёзки — выбери, кого имел в виду"}</p>
    <div class="hits">${choices.map((p) => html`<button class=${cx("hit", picked?.id === p.id && "on")} onClick=${() => choose(p)}>
      <${Face} p=${p} size=${40} /><span class="hit-name"><b>${p.name}</b><small>${p.born ?? "—"} г. р.</small></span><i>${picked?.id === p.id ? "✓" : "↵"}</i></button>`)}</div>`;
  else if (query.length >= 2 && picked?.name !== query) {
    body = !hits.length && query.trim().length >= 3 ? html`<div class="info-card">
        <div class="ic-title"><${Icon} name="search" size="15" weight="3" style="color:#F6D482" /><b>Совпадений не найдено</b></div>
        <p>Выбери футболиста из списка.</p></div>`
      : !hits.length ? html`<p class="hint-line">Никого не нашли — проверь написание</p>`
      : html`<div class="hits">${hits.slice(0, 5).reverse().map((p) => html`<button class=${cx("hit", picked === p && "on")} onClick=${() => choose(p)}>
          <${Face} p=${p} size=${40} /><span class="hit-name"><b>${p.name}</b><small>${p.born ? `${p.born} г. р.` : "год неизвестен"}</small></span><i>${picked === p ? "✓" : "↵"}</i></button>`)}</div>`;
  } else body = html`<p class="hint-line">Начни вводить фамилию. Не знаешь — спроси скаута.</p>`;

  const showClue = clue && clue.open.length && !scoutOpen && !mm && (query.length < 2 || picked);
  return html`<div class="answer">
    <div class="cond-bubble glass">
      <${TurnDial} m=${m} size=${40} />
      <span class="cond-pair"><${CondHalf} c=${col} /><i>×</i><${CondHalf} c=${row} /></span>
    </div>
    <div class="answer-scroll" ref=${wrap}>
      ${showClue ? html`<${ClueCard} clue=${clue} picked=${picked} used=${m.used} pick=${choose} />` : null}
      ${body}
    </div>
    <form class=${cx("answer-row", mm && "locked")} onSubmit=${submit} action="#">
      <span class=${cx("field", picked && "picked")}>
        <input ref=${field} value=${query} onInput=${(e) => type(e.target.value)} placeholder=${picked?.name ?? "Фамилия игрока…"}
          autocapitalize="words" autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="send" disabled=${!!mm} />
        <button type="submit" class=${cx("send", picked && "on", busy && "busy")} disabled=${!picked || busy} aria-label=${picked ? `Ответить: ${picked.name}` : "Ответить"}><${Icon} name="up" size="17" weight="3" /></button>
      </span>
      <button type="button" class=${cx("round-tool press", scoutOpen && "on")} disabled=${!!mm} aria-label=${`Скаут, жетонов: ${m.tokens}`}
        onPointerDown=${(e) => e.preventDefault()} onClick=${() => setScoutOpen(!scoutOpen)}>
        <img src=${img("scout")} alt="" /><b class="coin-badge">${m.tokens}</b></button>
    </form>
  </div>`;
}

const CondHalf = ({ c }) => html`<span class="cond-half"><${ConditionIcon} icon=${c.icon} size=${26} /><b>${c.title}</b></span>`;

/** A listed player the base says does not fit: ask the opponent to count him, or cancel and name someone else. */
function MismatchCard({ mm, cancel, ask }) {
  const p = byId[mm.playerId];
  const reason = mm.why.replace(p.name + " ", "");
  return html`<div class="mismatch">
    <div class="mm-top">
      <span class="mm-face"><${Face} p=${p} size=${46} /><i><${Icon} name="x" size="9" weight="4" /></i></span>
      <span class="mm-text"><b>${p.name}</b><em>${reason[0].toUpperCase() + reason.slice(1)}</em><small>Если база ошибается, соперник может зачесть</small></span>
    </div>
    <div class="mm-actions">
      <button class="navy-btn" onClick=${cancel}>Отмена</button>
      <button class="gold-btn press" onClick=${ask}>Попросить зачёт</button>
    </div>
  </div>`;
}

/** The scout's three hints, one tap each; open ones are marked and not sold again. */
function ScoutChoices({ m, cell, clue, bought }) {
  const choice = (h, detail) => {
    const opened = clue?.open.includes(h.id), afford = m.tokens >= h.cost;
    return html`<button class=${cx("scout-choice", opened && "open")} disabled=${opened || !afford}
      onClick=${async () => { if (!opened && (await m.buy(h, cell))) { bought(h.id); store.changed(); } }}>
      <span><b>${h.title}</b><small>${opened ? "Открыто" : !afford ? `Нужно ещё ${h.cost - m.tokens} жет.` : detail}</small></span>
      ${opened ? html`<${Icon} name="check" size="16" weight="3" style="color:#32E5A1" />` : html`<span class="cost"><img src=${img("coin")} alt="" /><b>${h.cost}</b></span>`}
    </button>`;
  };
  return html`<div class="scout">
    <div class="scout-head"><img src=${img("scout")} alt="" /><b>Скаут</b><span class="cost small"><img src=${img("coin")} alt="" /><b>${m.tokens}</b></span></div>
    <p class="hint-line small">Подсказки видны обоим. Каждая покупается отдельно.</p>
    ${choice(Hints.profile, "Футбольные факты без имени")}
    ${choice(Hints.letters, "Первые буквы и длина имени")}
    ${choice(Hints.four, "Один верный ответ среди четырёх")}
    <p class="hint-line tiny">Два самостоятельных верных захвата подряд: +1. Не более +2 за раунд.</p>
  </div>`;
}

/** The site's scout reveal: «ОТКРЫТО ДЛЯ ОБОИХ», the facts, the mask, the four names. */
function ClueCard({ clue, picked, used, pick }) {
  return html`<div class="clue">
    <div class="clue-head"><img src=${img("scout")} alt="" /><small>ОТКРЫТО ДЛЯ ОБОИХ</small><b>${clue.open.map((h) => Hints[h].title).join(" · ")}</b></div>
    ${clue.open.includes("profile") ? (clue.facts ?? clueFacts(clue)).map((f) => html`<div class="fact"><small>${f.label}</small><b>${[f.flag, f.text].filter(Boolean).join(" ")}</b></div>`) : null}
    ${clue.open.includes("letters") ? html`<div class="mask">${(clue.mask ? clue.mask.split(" ") : clueMask(clue)).map((w) => html`<b>${w}</b>`)}</div>
      <p class="hint-line small">Первые буквы открыты, точки заменяют остальные.</p>` : null}
    ${clue.open.includes("four") && clue.options ? html`<p class="hint-line small">Выбери имя. Ошибка передаст ход.</p>
      <div class="four">${clue.options.map((p, j) => html`<button class=${cx("four-opt", picked?.id === p.id && "on")} disabled=${p.used || used.has(p.id)} onClick=${() => pick(p)}>
        <i>${j + 1}</i><b>${p.name}</b></button>`)}</div>` : null}
  </div>`;
}

export function ChatSheet({ m, openStands, openViewer }) {
  const [text, setText] = useState("");
  const [menuFor, setMenuFor] = useState(null);
  const list = useRef();
  useEffect(() => { const el = list.current; if (el) el.scrollTop = el.scrollHeight; }, [m.chat.length]);
  const send = (e) => { e.preventDefault(); const t = text.trim(); if (!t) return; m.send(t); setText(""); store.changed(); };
  const press = useRef();
  const hold = (msg) => ({
    onPointerDown: () => { press.current = setTimeout(() => setMenuFor(msg.id), 450); },
    onPointerUp: () => clearTimeout(press.current), onPointerLeave: () => clearTimeout(press.current),
    onContextMenu: (e) => { e.preventDefault(); setMenuFor(msg.id); },
  });
  return html`<div class="chat">
    <div class="chat-head">
      <h2>Чат матча</h2>
      ${m.viewers.length ? html`<button class="stands-chip press" onClick=${openStands} aria-label=${`Трибуна: ${m.viewers.length}`}>
        <${Icon} name="eye" size="12" /><b>${m.viewers.length}</b><${Icon} name="right" size="9" weight="3.4" /></button>` : null}
      <small>удержи сообщение — жалоба</small>
    </div>
    <div class="chat-list" ref=${list}>
      ${m.chat.filter((x) => !m.isBlocked(x.who)).map((x) => x.kind === "friendOut" ? html`<div class="friend-line">
          <${Icon} name=${m.relation === "friends" ? "friends" : "friendAdd"} size="14" />${m.relation === "friends" ? "Вы теперь друзья" : "Ты предложил дружбу · ждём ответа"}</div>`
        : x.kind === "friendIn" ? html`<div class="friend-card">
          <${Icon} name="friendAdd" size="17" style="color:#32E5A1" />
          <span>${m.relation === "friends" ? "Вы теперь друзья" : `${m.opponent.name} хочет дружить`}</span>
          ${m.relation === "incoming" ? html`<button class="green-pill press" onClick=${() => { m.acceptFriend(); store.changed(); }}>Принять</button>`
            : m.relation === "friends" ? html`<${Icon} name="check" size="15" weight="3" style="color:#32E5A1" />` : null}</div>`
        : html`<div class=${cx("msg", x.who === "Ты" && "me", x.spectator && "spec")} ...${hold(x)}>
          <button class="who" disabled=${!x.spectator || x.who === "Ты"} onClick=${() => openViewer(x.who)}>
            <span class=${x.spectator && x.who !== "Ты" ? "u" : ""}>${x.who}</span>${x.spectator ? html`<i> · зритель</i>` : null}</button>
          <span class="text">${x.text}</span>
          ${menuFor === x.id && x.who !== "Ты" ? html`<span class="msg-menu">
            <button onClick=${() => { setMenuFor(null); m.report(); store.changed(); }}>Пожаловаться</button>
            <button class="red" onClick=${() => { setMenuFor(null); m.block(x.spectator ? x.who : null); store.changed(); }}>Заблокировать</button></span>` : null}
        </div>`)}
    </div>
    <div class="reactions">${["👏", "🔥", "😅", "😎", "🤝"].map((e) => html`<button class="press" onClick=${() => { m.react(e); store.changed(); }} aria-label=${`Отправить ${e}`}>${e}</button>`)}</div>
    <form class="answer-row" onSubmit=${send} action="#">
      <span class="field chat-field">
        <input value=${text} onInput=${(e) => setText(e.target.value)} placeholder="Напиши сообщение" enterkeyhint="send" autocomplete="off" />
        <button type="submit" class=${cx("send", text.trim() && "on")} disabled=${!text.trim()} aria-label="Отправить"><${Icon} name="up" size="17" weight="3" /></button>
      </span>
    </form>
  </div>`;
}

/** The opponent asks you to count a name the base does not know: 20 seconds, silence is a refusal. */
export function ReviewDecision({ m, review }) {
  const r = review;
  if (!r) return null;
  const row = m.rows[Math.floor(r.cell / 3)], col = m.cols[r.cell % 3];
  const nm = r.name ?? byId[r.playerId].name;
  const C = 2 * Math.PI * 21;
  return html`<div class="review">
    <div class="rv-top">
      <span><small>НУЖНО ТВОЁ РЕШЕНИЕ</small><b>${nm}</b></span>
      <span class="rv-ring"><svg viewBox="0 0 50 50"><circle cx="25" cy="25" r="21" fill="none" stroke="#1D2C3D" stroke-width="4" />
        <circle class="arc" cx="25" cy="25" r="21" fill="none" stroke="#F6D482" stroke-width="4" stroke-linecap="round" stroke-dasharray=${C}
          stroke-dashoffset=${C * (1 - r.left / 20)} transform="rotate(-90 25 25)" /></svg><b>${r.left}</b></span>
    </div>
    <div class="rv-conds"><${ConditionIcon} icon=${col.icon} size=${24} /><b>${col.title}</b><i>×</i><${ConditionIcon} icon=${row.icon} size=${24} /><b>${row.title}</b></div>
    <p>${r.why ? `По базе: ${r.why.replace(nm + " ", "")}.` : "В базе это сочетание не подтверждено."} Молчание — отказ.</p>
    <div class="mm-actions">
      <button class="navy-btn" disabled=${m.review !== r} onClick=${() => { m.decideReview(false); store.changed(); }}>Не засчитывать</button>
      <button class="green-btn press" disabled=${m.review !== r} onClick=${() => { m.decideReview(true); store.changed(); }}>Зачесть</button>
    </div>
  </div>`;
}

/** The stands (the site's «Трибуна · N / 24»): who watches this match. */
export function StandsSheet({ m, open }) {
  return html`<div class="stands">
    <div class="sheet-head"><h2>Трибуна</h2><small>${m.viewers.length} / ${MAX_VIEWERS}</small></div>
    <${ViewerList} viewers=${m.viewers} me=${m.myName} relations=${m.viewerRelations} open=${open} />
    <p class="hint-line small">Нажми на зрителя — откроется профиль. Зрители видят поле и пишут в чат, но не ходят.</p>
  </div>`;
}

export const ViewerList = ({ viewers, me, relations = {}, open }) => html`<div class="viewer-list">${viewers.map((v) => html`
  <button class="viewer press" onClick=${() => open(v)}>
    <span class="v-av">${v.slice(0, 2).toUpperCase()}</span><b>${v}</b>
    ${v === me ? html`<i class="you">ты</i>` : null}
    <span class="sp"></span>
    ${relations[v] === "outgoing" ? html`<small>заявка</small>` : relations[v] === "friends" ? html`<${Icon} name="friends" size="13" style="color:#32E5A1" />`
      : relations[v] === "blocked" ? html`<${Icon} name="hand" size="13" style="color:#FF8B97" />` : null}
    <${Icon} name="right" size="12" weight="3" class="chev" />
  </button>`)}</div>`;
