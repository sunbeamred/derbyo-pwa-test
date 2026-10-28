// The match screen (port of MatchView.swift and Motion.swift).
import { html, useState, useEffect, useRef, cx, img, Icon, Panel, useSheet, Alert, Toast, RatingTag, breakable, vibrate } from "./common.js";
import { byId } from "../data.js";
import { photoOf } from "../net.js";
import { store } from "../model.js";
import { Sound } from "../sound.js";
import { AnswerSheet, ChatSheet, ReviewDecision, StandsSheet } from "./sheets.js";
import { ProfileSheet } from "./profile.js";

const RED = "#FF5364", MINT = "#32E5A1", GOLD = "#F6D482", MUTED = "#A8B8CA";
const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Focus moves to a hidden field inside the tap, so iOS raises the keyboard; the real field takes it over. */
export const raiseKeyboard = () => document.getElementById("kbd-proxy")?.focus();

export function MatchScreen({ m, close, findNew, minimize }) {
  const [answerCell, setAnswerCell] = useState(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOf, setProfileOf] = useState(null);
  const [standsOpen, setStandsOpen] = useState(false);
  const [viewer, setViewer] = useState(null);
  const [confirmSurrender, setConfirmSurrender] = useState(false);
  const [shownToast, setShownToast] = useState(null);
  const [entering, setEntering] = useState(true);
  const [finishing, setFinishing] = useState(0);
  const [coins, setCoins] = useState(0);
  const menuOpenedAt = useRef(0);
  const prev = useRef({});

  // Notices: each new one shows for 2.4 s.
  useEffect(() => {
    if (!m.toast) return;
    setShownToast(m.toast);
    const t = setTimeout(() => setShownToast((s) => (s === m.toast ? null : s)), 2400);
    return () => clearTimeout(t);
  }, [m.toast?.id]);
  useEffect(() => { const t = setTimeout(() => setEntering(false), reduceMotion() ? 200 : 1050); return () => clearTimeout(t); }, []);
  useEffect(() => {
    if (!m.reward) return;
    if (m.reward.coins) setCoins(m.reward.id);
    const r = m.reward;
    const t = setTimeout(() => { if (m.reward === r) { m.reward = null; store.changed(); } }, 2800);
    return () => clearTimeout(t);
  }, [m.reward?.id]);
  // Time outside the app spends the match's away budget, as on the site.
  useEffect(() => {
    let at = null;
    const f = () => { if (document.hidden) at = Date.now(); else if (at) { m.cameBack(Math.floor((Date.now() - at) / 1000)); at = null; store.changed(); } };
    document.addEventListener("visibilitychange", f);
    return () => document.removeEventListener("visibilitychange", f);
  }, [m]);

  // Sounds and vibration on game events, as the app's onChange handlers.
  useEffect(() => {
    const p = prev.current;
    if (p.landed !== undefined && m.landed !== p.landed && !m.roundOver) { Sound.play("good"); vibrate(15); }
    if (p.miss !== undefined && m.missSignal !== p.miss) { Sound.play("bad"); vibrate([20, 40, 20]); }
    if (p.turn !== undefined && m.turn !== p.turn && m.turn === 0 && !m.roundOver) Sound.play("turn");
    if (p.away !== undefined && (m.oppAwayFor === null) !== p.away) Sound.play(m.oppAwayFor === null ? "presence-back" : "presence-away");
    if (p.alert !== undefined && m.timerAlert !== p.alert) Sound.play(m.seconds <= 5 ? "timer-5" : "timer-15");
    if (p.unread !== undefined && m.unread > p.unread) Sound.play("chat");
    if (p.finish !== undefined && m.finishSignal !== p.finish) {
      Sound.play(m.matchOver ? "series-complete" : "win");
      setFinishing(m.finishSignal);
      setTimeout(() => setFinishing(0), 3500);
    }
    prev.current = { landed: m.landed, miss: m.missSignal, turn: m.turn, away: m.oppAwayFor === null, alert: m.timerAlert, unread: m.unread, finish: m.finishSignal };
  });
  const closeAnswer = () => { m.cancelMismatch(); setAnswerCell(null); m.selected = null; store.changed(); };
  const tapCell = (i) => { raiseKeyboard(); m.select(i); if (m.selected !== null) setAnswerCell(i); store.changed(); };
  // The review panel slides away once the decision is made (or the time runs out).
  const [reviewShown, reviewShut, reviewGone] = useSheet(m.review?.owner === 1);
  const lastReview = useRef(null);
  if (m.review?.owner === 1) lastReview.current = m.review;

  const notes = [...m.rows, ...m.cols].filter((c) => c.note);
  const slotLine = m.watching ? "Ты на трибуне: ходить нельзя, болеть в чате можно" : m.turn === 0 ? "Выбери клетку и назови футболиста" : "Ход соперника. Присмотри клетку на свой ход";

  let leaveMenu = null;
  const menuRow = (title, run, { destructive = false, enabled = true } = {}) => html`
    <button class=${cx("navy-btn menu-row", destructive && "destructive")} disabled=${!enabled}
      onClick=${() => { if (Date.now() - menuOpenedAt.current < 500) return; leaveMenu?.(); run(); store.changed(); }}>${title}</button>`;
  const invite = async () => {
    const text = `Сыграем в DERBYO? Комната ${m.code}: derbyo.online/r/${m.code.replace(" ", "")}`;
    try { if (navigator.share) await navigator.share({ text }); else { await navigator.clipboard.writeText(text); m.show("Приглашение скопировано", true); store.changed(); } } catch {}
  };
  const menu = (leave) => (leaveMenu = leave, html`<div class="menu">
    <h2>Матч</h2>
    ${m.watching ? html`
      ${menuRow(Sound.enabled ? "Выключить звук" : "Включить звук", () => (Sound.enabled = !Sound.enabled))}
      ${menuRow("Свернуть", minimize)}
      ${menuRow("Уйти с трибуны", close)}` : html`
      ${!m.matchOver ? menuRow("Свернуть матч", minimize) : null}
      ${menuRow(`Пригласить · код ${m.code}`, invite)}
      ${m.roundOver ? menuRow(m.canLeaveFree ? "Выйти без штрафа" : m.matchOver ? "На главную" : "Выйти из матча", close) : html`
        ${menuRow(Sound.enabled ? "Выключить звук" : "Включить звук", () => (Sound.enabled = !Sound.enabled))}
        ${m.paused ? menuRow(m.resumeWait === null ? "Продолжить" : `Ждём ${m.opponent.name}…`, () => m.requestResume())
          : m.oppPauseAskLeft !== null ? menuRow("Принять паузу", () => m.acceptPause())
          : m.pauseAskLeft !== null ? menuRow(`Пауза предложена · ${m.pauseAskLeft} с`, () => {})
          : menuRow("Пауза", () => m.requestPause(), { enabled: !m.canLeaveFree })}
        ${m.turn === 0 && !m.paused ? menuRow("Передать ход", () => m.passOnPurpose()) : null}
        ${m.canLeaveFree ? menuRow(`Выйти без штрафа · ${m.opponent.name} не отвечает`, close)
          : menuRow("Сдаться в раунде", () => setConfirmSurrender(true), { destructive: true })}`}`}
  </div>`);

  if (!m.hasBoard || m.closed) return html`<div class="match"><div class="match-wait">
    <span class="spinner muted big"></span><b>${m.closed ?? "Выходим на поле…"}</b>
    <small>${m.closed ? "" : !m.state ? "Соединяемся с сервером" : m.opponent?.present ? `Ждём, пока ${m.opponent.name} выйдет на поле` : "Ждём соперника"}</small>
    <button class="navy-btn" onClick=${close}>${m.closed ? "Закрыть" : "Выйти"}</button></div></div>`;
  return html`<div class="match">
    <div class="match-body">
      <${Scoreboard} m=${m} openProfile=${setProfileOf} openStands=${() => setStandsOpen(true)} />
      <${Board} m=${m} tap=${tapCell} />
      <div class="slot">
        ${notes.length ? html`<div class=${cx("notes", (m.offerRaise || m.roundOver) && "hidden")}>
          ${notes.map((c) => html`<div><b>${(c.label ?? c.title) + ": "}</b><span>${c.note}</span></div>`)}</div>` : null}
        ${m.offerRaise ? html`<div class="raise-offer glass">
            <span>Снова ничья. Следующий раунд — «${m.raisedLevel}»?</span>
            <button class="navy-btn small" onClick=${() => m.raiseLevel(false)}>Оставить</button>
            <button class="gold-pill press" onClick=${() => m.raiseLevel(true)}>Сложнее</button>
          </div>`
        : m.roundOver ? html`<${ResultBubble} m=${m} key=${m.finishSignal} />`
        : !notes.length ? html`<p class=${cx("slot-line", (shownToast || m.reward) && "hidden")}>${slotLine}</p>` : null}
        <div class="slot-notices">
          ${shownToast ? html`<${Toast} toast=${shownToast} />` : null}
          ${m.reward ? html`<${RewardNotice} reward=${m.reward} key=${m.reward.id} />` : null}
        </div>
      </div>
      <${BottomTray} m=${m} findNew=${findNew} close=${close}
        openChat=${() => { m.unread = 0; setChatOpen(true); }} openMenu=${() => { menuOpenedAt.current = Date.now(); setMenuOpen(true); }} />
    </div>
    ${finishing && !reduceMotion() ? html`<${FinishAtmosphere} winner=${m.roundWinner === null ? null : m.seat(m.roundWinner)} key=${finishing} />` : null}
    ${coins && !reduceMotion() ? html`<${CoinAtmosphere} key=${coins} done=${() => setCoins(0)} />` : null}
    ${answerCell !== null ? html`<${Panel} onClose=${closeAnswer} shut=${m.turn !== 0 || m.roundOver} class="answer-panel">${(leave) => html`<${AnswerSheet} m=${m} cell=${answerCell} dismiss=${leave} />`}<//>` : null}
    ${chatOpen ? html`<${Panel} onClose=${() => setChatOpen(false)} class="chat-panel">${(leave) => html`
      <${ChatSheet} m=${m} openStands=${() => { leave(); setStandsOpen(true); }} openViewer=${(v) => { leave(); setViewer(v); }} />`}<//>` : null}
    ${reviewShown ? html`<${Panel} closable=${false} shut=${reviewShut} onClose=${reviewGone}><${ReviewDecision} m=${m} review=${lastReview.current} /><//>` : null}
    ${standsOpen ? html`<${Panel} onClose=${() => setStandsOpen(false)}>${(leave) => html`<${StandsSheet} m=${m} open=${(v) => { leave(); setViewer(v); }} />`}<//>` : null}
    ${viewer ? html`<${Panel} onClose=${() => setViewer(null)}>${(leave) => html`<${ProfileSheet} m=${m} owner=${1} viewer=${viewer} close=${leave} />`}<//>` : null}
    ${profileOf !== null ? html`<${Panel} onClose=${() => setProfileOf(null)}>${(leave) => html`<${ProfileSheet} m=${m} owner=${profileOf} close=${leave} />`}<//>` : null}
    ${menuOpen ? html`<${Panel} onClose=${() => setMenuOpen(false)}>${menu}<//>` : null}
    ${confirmSurrender ? html`<${Alert} title=${`Сдаться в раунде ${m.round}?`} message=${`Раунд выиграет ${m.opponent.name}. Счёт станет ${m.score[0]}:${m.score[1] + 1}.`}
      onClose=${() => setConfirmSurrender(false)}
      actions=${[{ title: "Играть дальше", run: () => setConfirmSurrender(false) }, { title: "Сдаться", kind: "destructive", run: () => { setConfirmSurrender(false); m.surrender(); store.changed(); } }]} />` : null}
    ${entering ? html`<${Entrance} />` : null}
  </div>`;
}

/** The site's match header in one compact card: players around the score and round steps, the level path below. */
function Scoreboard({ m, openProfile, openStands }) {
  const mover = m.roundOver || m.paused ? null : m.turn;
  const tint = (o) => (m.seat(o) === 0 ? RED : MINT);
  const live = (o) => m.turn === o && !m.roundOver;
  return html`<div class="scoreboard glass">
    <div class="side-tints">
      <div class=${cx("tint", mover === 0 && "on")} style=${`--t:${tint(0)}`}></div>
      <div class=${cx("tint right", mover === 1 && "on")} style=${`--t:${tint(1)}`}></div>
    </div>
    <div class="score-row">
      <${PlayerSide} name=${m.leftName} mark=${m.mark(0)} red=${m.mySeat === 0} tokens=${m.tokens} active=${live(0)} mine=${true}
        reaction=${m.myReaction} onClick=${() => openProfile(0)} />
      <div class="scorebug" aria-label=${`Счёт ${m.score[0]}:${m.score[1]}, раунд ${m.round}`}>
        <div class="digits"><b class="digit">${m.score[0]}</b><span class="colon">:</span><b class="digit">${m.score[1]}</b></div>
        <${RoundSteps} results=${m.roundResults.map((r) => (r === null ? null : m.seat(r)))} current=${m.round} live=${!m.roundOver} />
      </div>
      <${PlayerSide} name=${m.opponent.name} mark=${m.mark(1)} red=${m.mySeat === 1} tokens=${m.oppTokens} active=${live(1)} mine=${false}
        isBot=${m.opponent.isBot} reaction=${m.oppReaction} away=${m.oppAwayFor} left=${m.oppLeft} missed=${m.oppMissed} onClick=${() => openProfile(1)} />
    </div>
    <div class="level-row">
      <span class=${cx("fade", live(0) && "on")}>${m.myRating != null ? html`<${RatingTag} flag=${m.myFlag} rating=${m.myRating} rank=${m.myRank} />` : null}</span>
      <span class="level-path">${m.levelPath.map((s, i) => html`${i > 0 ? html`<i>→</i>` : null}<span class=${s.current ? "cur" : ""}>${s.name}</span>`)}</span>
      <span class=${cx("fade", live(1) && "on")}>${m.opponent.rating != null ? html`<${RatingTag} flag=${m.opponent.flag} rating=${m.opponent.rating} rank=${m.opponent.rank} flagAfter=${true} />` : null}</span>
    </div>
    ${m.viewers.length ? html`<button class="eye-badge press" onClick=${openStands} aria-label=${`Трибуна: ${m.viewers.length}`}>
      <${Icon} name="eye" size="11" /><b>${m.viewers.length}</b></button>` : null}
  </div>`;
}

/** A player as on the site's player card, folded into half the header width. */
function PlayerSide({ name, mark, red, tokens, active, mine, isBot, reaction, away = null, left = false, missed = 0, onClick }) {
  const [echo, setEcho] = useState(null);
  useEffect(() => {
    if (!reaction) return;
    setEcho(reaction);
    const t = setTimeout(() => setEcho(null), 1000);
    return () => clearTimeout(t);
  }, [reaction?.n]);
  const status = left ? html`<span class="st left">○ покинул матч</span>`
    : missed > 0 && away === null ? html`<span class=${cx("st", missed >= 2 ? "idle" : "missed")}>${missed >= 2 ? "⏱ не отвечает" : "⏱ пропустил ход"}</span>`
    : away !== null ? html`<span class="st away">◒ свернул ${away} с</span>`
    : html`<span class="st in">● в игре</span>`;
  const tokenCount = html`<span class="tokens"><img src=${img("coin")} alt="" /><b>${tokens}</b></span>`;
  const gone = away !== null || left;
  const avatar = html`<span class=${cx("pavatar", red ? "red" : "green", active && "active", !mine && gone && "gone", mine ? "mine" : "theirs")}>
    <span class="face">${isBot ? html`<img class="bot" src=${img("bot")} alt="" />` : name.slice(0, 2).toUpperCase()}</span>
    <img class="pmark" src=${img(mark)} alt="" />
  </span>`;
  return html`<button class=${cx("pside", mine ? "mine" : "theirs", active && "active")} onClick=${onClick} aria-label=${`${name}, открыть профиль`}>
    ${mine ? avatar : null}
    <span class="pinfo">
      <span class="pname">${breakable(name)}</span>
      <span class="pstatus">
        ${!mine && away === null && !left && missed === 0 ? tokenCount : null}
        ${status}
        ${mine && away === null ? tokenCount : null}
      </span>
    </span>
    ${!mine ? avatar : null}
    ${echo ? html`<span class="reaction-echo" key=${echo.n}><i></i><i></i><b>${echo.e}</b></span>` : null}
  </button>`;
}

/** One bar per round, filled with the winner's colour, the live round outlined; long matches fold into "+N". */
function RoundSteps({ results, current, live }) {
  const total = Math.max(3, results.length + (live ? 1 : 0));
  const first = total > 5 ? total - 4 : 0;
  const steps = [];
  for (let i = first; i < total; i++) {
    const r = i < results.length ? results[i] : undefined;
    steps.push(html`<i class=${cx("step", r === undefined ? "" : r === 0 ? "x" : r === 1 ? "o" : "d", i === current - 1 && live && "live")}></i>`);
  }
  return html`<div class="round-steps">${first > 0 ? html`<b>+${first}</b>` : null}${steps}</div>`;
}

export function ConditionIcon({ icon, size = 34 }) {
  const s = `--s:${size}px`;
  switch (icon.kind) {
    case "crest": case "image": return html`<img class="cicon" style=${s} src=${icon.src} alt="" />`;
    case "flag": return html`<span class="cicon flag" style=${s}>${icon.emoji}</span>`;
    case "league": return html`<span class="cicon flag league" style=${s}>${icon.emoji}<img src=${img("ball")} alt="" /></span>`;
    case "person": {
      const ph = icon.photo ?? photoOf(icon.person);
      return html`<span class="cicon person" style=${s}>${ph ? html`<img class="ph" src=${ph} alt="" />` : null}<img class="fr" src=${icon.frame} alt="" /></span>`;
    }
    case "text": return html`<span class="cicon text" style=${s}>${icon.text}</span>`;
  }
}

/** A row label in the narrow left column: one word per line, shrunk together to fit. */
function WordLines({ text }) {
  const words = text.split(" ");
  const longest = Math.max(...words.map((w) => w.length));
  const size = Math.max(8, Math.min(12, 12 * 8.4 / Math.max(longest, 1)));
  return html`<span class="word-lines" style=${`font-size:${size}px`}>${words.map((w) => html`<span>${w}</span>`)}</span>`;
}

function Board({ m, tap }) {
  const ref = useRef();
  const lastMiss = useRef(m.missSignal);
  const lastReward = useRef(null);
  // motion.js "miss": a short sideways shake on a wrong answer or a lapsed turn.
  useEffect(() => {
    if (m.missSignal === lastMiss.current) return;
    lastMiss.current = m.missSignal;
    if (!reduceMotion()) ref.current?.animate([{ transform: "translateX(0)" }, { transform: "translateX(-5px)" }, { transform: "translateX(4px)" }, { transform: "translateX(-2px)" }, { transform: "translateX(0)" }], { duration: 260 });
  }, [m.missSignal]);
  // motion.js fast reward: the cells ripple out from the answered one.
  useEffect(() => {
    const r = m.reward;
    if (!r || !r.fast || lastReward.current === r.id || reduceMotion()) return;
    lastReward.current = r.id;
    ref.current?.querySelectorAll(".cell").forEach((el, i) => {
      el.animate([{ transform: "translateY(0)" }, { transform: "translateY(-3px) rotate(.45deg)" }, { transform: "translateY(2px) rotate(-.35deg)" }, { transform: "none" }],
        { duration: 550, delay: 35 * Math.abs(i - r.cell), easing: "ease-in-out" });
    });
  }, [m.reward?.id]);
  const winning = [...Array(9).keys()].filter((i) => m.cells[i]?.winning);
  const locked = m.turn !== 0 || m.roundOver || m.paused || m.review || m.watching;
  return html`<div class="board" ref=${ref}>
    <div class="board-row head">
      <span class="lead"></span>
      ${m.cols.map((c) => html`<span class="col-head"><${ConditionIcon} icon=${c.icon} size=${38} /><span class="col-title">${c.title}</span></span>`)}
    </div>
    ${[0, 1, 2].map((r) => html`<div class="board-row">
      <span class="lead row-head"><${ConditionIcon} icon=${m.rows[r].icon} size=${38} /><${WordLines} text=${m.rows[r].title} /></span>
      ${[0, 1, 2].map((c) => {
        const i = r * 3 + c, cell = m.cells[i];
        return html`<${Cell} key=${i} cell=${cell} cross=${cell ? m.seat(cell.owner) === 0 : false}
          selected=${m.selected === i || (m.review?.owner === 0 && m.review?.cell === i)} locked=${locked}
          oppPick=${m.oppSelected === i || (m.review?.owner === 1 && m.review?.cell === i)} clued=${!!m.sharedClues[i]}
          recent=${m.recent === i} disputed=${m.review?.cell === i} plain=${m.watching} phase=${Math.max(0, winning.indexOf(i)) * 0.3}
          label=${`${m.rows[r].title} и ${m.cols[c].title}`}
          tap=${() => { if (!cell && m.turn === 0 && !m.watching && !m.roundOver && !m.paused && !m.review) tap(i); }} />`;
      })}
    </div>`)}
  </div>`;
}

function Cell({ cell, cross, selected, locked, oppPick, clued, recent, disputed, plain, phase, label, tap }) {
  if (cell?.blocked) return html`<button class="cell free locked" aria-label=${`${label}: закрыта опекой`}><img class="cell-glyph lock" src=${img("lock")} alt="" /></button>`;
  const p = !cell ? null : cell.name ? { name: cell.name, photo: photoOf(cell) } : byId[cell.playerId];
  const cls = cx("cell", cell ? (cross ? "taken x" : "taken o") : "free", selected && "selected", oppPick && !cell && "opp-pick",
    cell?.winning && "winning", recent && "recent", locked && !oppPick && "locked");
  return html`<button class=${cls} onClick=${tap} aria-label=${label} style=${`--phase:${-phase}s`}>
    ${p ? html`
      ${p.photo ? html`<img class="cell-photo" src=${p.photo} alt="" />` : null}
      <span class="cell-shade"></span>
      <img class="cell-mark" src=${img(cross ? "mark-x" : "mark-o")} alt="" />
      <span class=${cx("cell-name", p.name.split(" ").some((w) => w.length > 11) && "long")}>${p.name}</span>
      ${cell.winning ? html`<span class="sheen"></span>` : null}
      ${recent ? html`<span class="echo"></span>` : null}` : html`
      <img class=${cx("cell-glyph", locked && !oppPick ? "lock" : "plus", plain && "plain")} src=${img(locked && !oppPick ? "lock" : "plus")} alt="" />
      ${clued ? html`<span class="clue-dot"><img src=${img("scout")} alt="" /></span>` : null}
      ${disputed ? html`<span class="cell-tag">На зачёте</span>`
        : oppPick ? html`<span class="cell-tag small">${plain ? "Выбор игрока" : "Выбор соперника"}</span>` : null}
      ${selected && !disputed ? html`<span class="cell-tag">Твой выбор</span>` : null}`}
  </button>`;
}

/** The turn clock as a ring by the thumb; after a round it closes in the winner's colour around their mark. */
export function TurnDial({ m, size = 52 }) {
  const mine = m.turn === 0;
  const low = mine && m.seconds <= 10 && !m.roundOver;
  const ws = m.roundWinner === null ? null : m.seat(m.roundWinner);
  const reviewing = m.review && !m.roundOver;
  const tint = m.roundOver ? (ws === 0 ? RED : ws === 1 ? MINT : GOLD) : reviewing ? GOLD : m.paused ? MUTED : low ? "#FF8B97" : m.seat(m.turn) === 0 ? RED : MINT;
  const fill = m.roundOver ? 1 : reviewing ? m.review.left / 20 : Math.min(1, Math.max(0, m.seconds) / 60);
  const R = 50 - 5, C = 2 * Math.PI * R, r2 = 50 - 18, C2 = 2 * Math.PI * r2;
  const away = m.oppAwayFor !== null ? { f: m.oppAwayBudget / 45, c: m.mySeat === 1 ? RED : MINT } : m.awaySeconds < 45 ? { f: m.awaySeconds / 45, c: "rgba(201,213,227,.7)" } : null;
  return html`<span class="dial" style=${`width:${size}px;height:${size}px`} aria-label=${m.roundOver ? "Раунд окончен" : `Осталось ${m.seconds} секунд на ход`}>
    <svg viewBox="0 0 100 100">
      <circle cx="50" cy="50" r="48" fill="rgba(0,0,0,.3)" />
      <circle cx="50" cy="50" r=${R} fill="none" stroke="#1D2C3D" stroke-width="9.5" />
      <circle class="arc" cx="50" cy="50" r=${R} fill="none" stroke=${tint} stroke-width="9.5" stroke-linecap="round"
        stroke-dasharray=${C} stroke-dashoffset=${C * (1 - fill)} transform="rotate(-90 50 50)" style=${`filter:drop-shadow(0 0 4px ${tint}8c)`} />
      ${away ? html`<circle class="arc" cx="50" cy="50" r=${r2} fill="none" stroke=${away.c} stroke-width="4" stroke-linecap="round"
        stroke-dasharray=${C2} stroke-dashoffset=${C2 * (1 - away.f)} transform="rotate(-90 50 50)" />` : null}
    </svg>
    <span class="dial-in">
      ${m.roundOver ? html`<img src=${img(m.roundWinner === null ? "trophy" : m.mark(m.roundWinner))} alt="" />`
        : m.paused ? html`<${Icon} name="pause" size="16" style="color:#A8B8CA" />`
        : m.review ? html`<b style="color:#F6D482">${m.review.left}</b>`
        : html`<b style=${low ? `color:${tint}` : ""}>${m.seconds}</b>`}
    </span>
  </span>`;
}

/** Two trays: the turn on the left (the dial swells across it into the round button), chat and menu on the right. */
function BottomTray({ m, findNew, close, openChat, openMenu }) {
  const opp = m.opponent.name;
  let pause = null;
  if (m.paused) pause = m.resumeWait !== null ? { title: `Ждём ${opp}…`, detail: `ты готов продолжить · ${m.resumeWait} с`, color: MUTED, run: () => {} }
    : { title: "Продолжить ▶︎", detail: "пауза · часы стоят", color: MINT, run: () => m.requestResume() };
  else if (m.oppPauseAskLeft !== null) pause = { title: "Принять паузу", detail: `${opp} просит паузу · ${m.oppPauseAskLeft} с`, color: GOLD, run: () => m.acceptPause() };
  else if (m.pauseAskLeft !== null) pause = { title: "Пауза предложена", detail: `ждём ${opp} · ${m.pauseAskLeft} с`, color: MUTED, run: () => {} };

  const mine = m.turn === 0;
  const title = m.watching ? (m.paused ? "Пауза" : `Ходит ${m.name(m.turn)}`)
    : m.review?.owner === 0 ? "Ждём решение" : m.review?.owner === 1 ? "Твоё решение"
    : m.paused ? "Пауза — часы стоят" : mine ? "Твой ход" : m.oppSelected !== null ? `${opp} думает…` : `Ходит ${opp}`;
  const color = m.review ? GOLD : m.paused ? MUTED : m.seat(m.turn) === 0 ? "#FFB3C1" : "#91FFD3";
  const sub = m.watching ? html`<small>ты на трибуне</small>`
    : m.review ? html`<small>зачёт: ${m.review.name ?? byId[m.review.playerId].name}</small>`
    : m.oppAwayFor !== null ? html`<small style=${`color:${m.mySeat === 1 ? "#FFB3C1" : "#91FFD3"}`}>◒ ${opp} · ещё ${m.oppAwayBudget} с</small>`
    : m.awaySeconds < 45 ? html`<small>${m.awaySeconds > 0 ? `вне игры: ещё ${m.awaySeconds} с` : "время вне игры вышло"}</small>` : null;

  return html`<div class="tray-row">
    <div class=${cx("tray turn-tray glass", m.roundOver && "over")}>
      ${m.roundOver ? html`<${RoundButton} m=${m} findNew=${findNew} />` : html`
        <${TurnDial} m=${m} size=${48} />
        ${m.canLeaveFree ? html`<button class="tray-label press" onClick=${m.paused ? close : findNew}>
            <b style="color:#32E5A1">${m.paused ? "Выйти без штрафа »" : "Новый соперник »"}</b>
            <small>${m.paused ? `${opp} не продолжает игру` : `${opp} не отвечает`}</small></button>`
        : pause ? html`<button class="tray-label press" onClick=${() => { pause.run(); store.changed(); }}>
            <b style=${`color:${pause.color}`}>${pause.title}</b><small>${pause.detail}</small></button>`
        : html`<span class="tray-label"><b style=${`color:${color}`}>${title}</b>${sub}</span>`}`}
    </div>
    <div class="tray tools-tray glass">
      <button class="tool press" onClick=${openChat} aria-label=${m.unread ? `Чат, новых сообщений: ${m.unread}` : "Чат"}>
        <img src=${img("chat")} alt="" />${m.unread ? html`<b class="badge">${m.unread}</b>` : null}</button>
      <i class="tool-sep"></i>
      <button class="tool press" onClick=${openMenu} aria-label="Меню матча"><img src=${img("menu")} alt="" /></button>
    </div>
  </div>`;
}

/** At the end of a round the dial swells into this button: what comes next. */
function RoundButton({ m, findNew }) {
  const done = m.matchOver, gone = done && m.oppLeft;
  // After the match leaving costs nothing, so a rematch nobody answers for 10 s offers a new opponent.
  const offerNew = (m.canLeaveFree && (m.rematchAsked || m.nextAsked)) || (m.online && done && m.rematchAsked && m.readyLeft <= 20);
  const waiting = (m.rematchAsked || m.nextAsked) && !offerNew;
  const opp = m.opponent.name;
  // Online the other player may have offered the rematch first: the same button accepts it.
  const accept = done && !gone && m.oppRematch;
  const acceptLeft = accept && m.rematchOffer ? Math.max(0, Math.ceil((m.rematchOffer.until - m.now()) / 1000)) : 0;
  const title = gone || offerNew ? "Новый соперник" : waiting ? (m.online && !m.readyLeft ? `Ждём ${opp}` : `Ждём ${opp} · ${m.readyLeft} с`) : accept ? "Принять реванш" : done ? "Реванш" : "Следующий раунд";
  const detail = m.watching ? "начнут игроки" : gone ? `${opp} покинул матч` : accept ? `${opp} предлагает · ${acceptLeft} с` : offerNew ? `${opp} не отвечает · ${m.readyLeft} с`
    : waiting ? (m.rematchAsked ? "реванш предложен" : `ты готов к раунду ${m.round + 1}`) : done ? `ещё матч с ${opp}` : `раунд ${m.round + 1} · ${m.nextLevel}`;
  const kind = waiting ? "wait" : done && !gone && !offerNew ? "gold" : "green";
  return html`<button class=${cx("round-btn press", kind)} disabled=${m.watching} aria-label=${`${title}, ${detail}`}
    onClick=${() => { gone || offerNew ? findNew() : done ? m.rematch() : m.askNextRound(); store.changed(); }}>
    <span class="rb-text"><b>${title}</b><small>${detail}</small></span>
    ${waiting ? html`<span class="spinner"></span>` : html`<span class="chev2">»</span>`}
  </button>`;
}

/** The round's result in a bubble under the board, in the winner's colour with their mark. */
function ResultBubble({ m }) {
  const w = m.roundWinner, done = m.matchOver;
  const title = m.watching && w === 0 ? (done ? `Матч выиграл ${m.leftName}` : `Раунд выиграл ${m.leftName}`)
    : w === 0 ? (done ? "Победа в матче!" : "Раунд твой")
    : w === 1 ? (done ? `Матч выиграл ${m.opponent.name}` : `Раунд выиграл ${m.opponent.name}`) : "Ничья в раунде";
  const ws = w === null ? null : m.seat(w);
  const tint = ws === 0 ? RED : ws === 1 ? MINT : GOLD;
  return html`<div class="result-bubble" style=${`--t:${tint}`}><img src=${img(w === null ? "whistle" : m.mark(w))} alt="" /><b>${title}</b></div>`;
}

/** .game-reward: the reward card; in 0.3 s, out at 2.35 s. */
const RewardNotice = ({ reward }) => html`<div class="reward"><b>${reward.title}</b><span>${reward.detail}</span></div>`;

/** motion.js finish(): eight blurred marks of the winner (both on a draw) drift up and away. */
function FinishAtmosphere({ winner }) {
  return html`<div class="atmo" aria-hidden="true">${[...Array(8).keys()].map((i) => {
    const mark = winner === null ? (i % 2 ? "mark-o" : "mark-x") : winner === 1 ? "mark-o" : "mark-x";
    return html`<img class="atmo-mark" src=${img(mark)} alt="" style=${`--x:${-20 + (i % 4) * 32}vw;--y:${25 + Math.floor(i / 4) * 55}vh;--d:${0.07 * i}s;--f:${2 + 0.04 * i}s`} />`;
  })}</div>`;
}

/** motion.js reward(): six blurred tokens drift up when a bonus token is earned. */
function CoinAtmosphere({ done }) {
  useEffect(() => { const t = setTimeout(done, 2200); return () => clearTimeout(t); }, []);
  return html`<div class="atmo" aria-hidden="true">${[...Array(6).keys()].map((i) =>
    html`<img class="atmo-coin" src=${img("coin")} alt="" style=${`--x:${-12 + i * 21}vw;--y:${65 + (i % 2) * 20}vh;--d:${0.06 * i}s`} />`)}</div>`;
}

/** .stadium-entrance: the site's «Выходим на поле» moment when a match starts (1.05 s). */
const Entrance = () => html`<div class="entrance" aria-hidden="true">
  <div class="ent-blur"></div><img class="ent-stadium" src="img/stadium.jpg" alt="" /><div class="ent-shade"></div><div class="ent-beams"></div>
  <div class="ent-copy"><small>DERBYO · МАТЧ СКОРО НАЧНЁТСЯ</small><b>Выходим на поле</b></div>
</div>`;
