// «Контекстно» and «Что их связывает» in the app's look, like «Футболист дня» (daily.js): the site's /api/contexto and /api/links,
// the same localStorage keys as the site's pages (progress is shared), a fixed top with tabs and levels, cards that scroll,
// and the answer field at the bottom bar opening a sheet over the keyboard.
import { html, useState, useEffect, useRef, cx, img, Icon, BottomBar, LobbyHeader, Panel, vibrate, Alert } from "./common.js";
import { Face } from "./sheets.js";
import { raiseKeyboard } from "./match.js";
import { account } from "../net.js";

const LEVEL_ICON = { 1: "level-rookie", 2: "level-amateur", 3: "level-knower", 4: "level-legend" };
const LEVEL_TINT = { 1: "#C9D5E3", 2: "#6FA8FF", 3: "#FFE45C", 4: "#FF7A3D" };
const clock = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return [s / 3600, (s % 3600) / 60, s % 60].map((n) => String(Math.floor(n)).padStart(2, "0")).join(":"); };
const plural = (n, one, few, many) => (n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? few : many);

/** A game's memory in localStorage, the site page's own key. */
function store(key, init) {
  let m = null;
  return {
    get() { if (!m) { try { m = JSON.parse(localStorage.getItem(key)) || {}; } catch { m = {}; } init(m); } return m; },
    save() { try { localStorage.setItem(key, JSON.stringify(m)); } catch {} },
  };
}
const caller = (base) => async (route, body = {}) => {
  const r = await fetch(`/api/${base}/${route}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await r.json().catch(() => ({ ok: false, error: "Сервер недоступен. Попробуй ещё раз." }));
  if (!data.ok) throw Object.assign(new Error(data.error || "Ошибка."), { code: data.code });
  return data;
};

/** The fixed top: header, mode tabs, the endless levels and one line under them. */
function GameTop({ title, back, tabs, mode, setMode, levels, level, setLevel, line }) {
  return html`<div class="game-top">
    <${LobbyHeader} title=${title} back=${back} />
    <div class="segmented talk-tabs dg-tabs" role="tablist">${tabs.map(([m, t]) => html`<button role="tab" aria-selected=${mode === m} class=${cx("press", mode === m && "on")} onClick=${() => mode !== m && setMode(m)}>${t}</button>`)}</div>
    ${mode === "endless" && levels ? html`<div class="dg-levels">${levels.map((l) => html`<button class=${cx("dg-level press", level === l.level && "on")} style=${`--t:${LEVEL_TINT[l.level]}`}
      onClick=${() => level !== l.level && setLevel(l.level)}><img src=${img(LEVEL_ICON[l.level])} alt="" /><b>${l.label}</b></button>`)}</div>` : null}
    ${line ? html`<p class="dg-line">${line}</p>` : null}
  </div>`;
}

/** The answer sheet, as in the match: what you type finds options; the closest sits at the bottom by the field. */
function PickSheet({ head, placeholder, find, row, used, choose, dismiss, empty }) {
  const [query, setQuery] = useState("");
  const [found, setFound] = useState([]);
  const field = useRef();
  useEffect(() => { field.current?.focus({ preventScroll: true }); }, []);
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setFound([]); return; }
    let live = true;
    const t = setTimeout(() => find(q).then((r) => live && setFound(r)).catch(() => {}), 180);
    return () => { live = false; clearTimeout(t); };
  }, [query]);
  const hits = found.slice(0, 6).reverse();
  // The closest match sits at the bottom, by the keyboard: the list opens scrolled down to it.
  const scroller = useRef();
  useEffect(() => { const el = scroller.current; if (el) el.scrollTop = el.scrollHeight; }, [found]);
  const pick = (x) => { if (!used.has(x.id)) { choose(x); dismiss(); } };
  return html`<div class="answer">
    ${head ? html`<div class="cond-bubble glass dg-ask">${head}</div>` : null}
    <div class="answer-scroll" ref=${scroller}>
      ${query.trim().length < 2 ? html`<p class="hint-line">${empty}</p>`
        : !hits.length ? html`<p class="hint-line">Ничего не нашли — проверь написание</p>`
        : html`<div class="hits">${hits.map((x) => html`<button class=${cx("hit", used.has(x.id) && "used")} disabled=${used.has(x.id)} onClick=${() => pick(x)}>${row(x, used.has(x.id))}<i>↵</i></button>`)}</div>`}
    </div>
    <form class="answer-row" action="#" onSubmit=${(e) => { e.preventDefault(); const x = hits.at(-1); if (x) pick(x); }}>
      <span class="field"><input ref=${field} value=${query} onInput=${(e) => setQuery(e.target.value)} placeholder=${placeholder}
        autocapitalize="words" autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="send" />
        <button type="submit" class=${cx("send", hits.length && "on")} disabled=${!hits.length} aria-label="Ответить"><${Icon} name="up" size="17" weight="3" /></button></span>
    </form>
  </div>`;
}
const playerRow = (p, used) => html`<${Face} p=${{ name: p.name, photo: p.photo }} size=${40} /><span class="hit-name"><b>${p.name}</b><small>${used ? "уже был" : p.birthYear ? `${p.birthYear} г. р.` : "год неизвестен"}</small></span>`;

/** The bottom bar's field: looks like the answer field, opens the sheet (the keyboard comes up in the tap, for iOS). */
const AskButton = ({ text, busy, open }) => html`<button class="dg-ask-btn press" disabled=${busy} onClick=${() => { raiseKeyboard(); open(); }}>
  <${Icon} name="search" size="17" /><span>${busy ? "Проверяем…" : text}</span></button>`;

async function share(text, setNote) {
  try { if (navigator.share) { await navigator.share({ text }); return; } } catch (e) { if (e.name === "AbortError") return; }
  try { await navigator.clipboard.writeText(text); setNote("Результат скопирован"); } catch {}
}

// ———————————————————————————— Контекстно ————————————————————————————

const ctxApi = caller("contexto");
const ctxMem = store("derbyo.contexto.v1", (m) => { m.daily ||= {}; m.endless = Object.assign({ level: 1, round: null, seen: [], stats: {} }, m.endless); });
const band = (rank) => (rank === 1 ? "win" : rank <= 100 ? "hot" : rank <= 500 ? "warm" : rank <= 1500 ? "cool" : "cold");

function CtxRow({ f, total, hint, why, fresh }) {
  const w = Math.max(4, Math.round(100 * (1 - Math.log(f.rank) / Math.log(total + 1))));
  return html`<div class=${cx("ctx-card", band(f.rank), fresh && "fresh")} style=${`--w:${w}%`}>
    <span class="ctx-fill"></span>
    <${Face} p=${{ name: f.name, photo: f.photo }} size=${34} />
    <span class="ctx-who"><b>${f.name}</b>${hint ? html`<em>подсказка</em>` : null}${why?.length ? html`<small>${why.join(" · ")}</small>` : null}</span>
    <b class="ctx-rank">#${f.rank}</b>
  </div>`;
}

export function ContextoView({ nav, join }) {
  const memo = ctxMem.get();
  const [mode, setMode] = useState(() => (join || memo.room ? "friends" : memo.appMode === "endless" ? "endless" : "daily"));
  const [st, setSt] = useState(null);
  const [rows, setRows] = useState([]);
  const [round, setRound] = useState(null);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const [giveUp, setGiveUp] = useState(false);
  const [last, setLast] = useState(null);
  const [, tick] = useState(0);
  const offset = useRef(0);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(t); }, []);
  useEffect(() => { ctxApi("state").then((s) => { offset.current = s.serverNow - Date.now(); setSt(s); }).catch((e) => setErr(e.message)); }, []);
  useEffect(() => { if (st && mode !== "friends") open(); }, [st, mode]);

  const pickMode = setMode;
  async function open() {
    setErr(null); setRows([]); setResult(null); setLast(null);
    memo.appMode = mode; ctxMem.save();
    let r;
    if (mode === "daily") {
      r = memo.daily[st.day];
      if (!r) { const d = await ctxApi("start", {}).catch((e) => setErr(e.message)); if (!d) return; r = memo.daily[st.day] = { token: d.token, guesses: [], hints: [], over: false }; ctxMem.save(); }
    } else {
      r = memo.endless.round;
      if (!r) { const d = await ctxApi("start", { level: memo.endless.level, avoid: memo.endless.seen }).catch((e) => setErr(e.message)); if (!d) return; r = memo.endless.round = { token: d.token, level: d.level, guesses: [], hints: [], over: false }; ctxMem.save(); }
    }
    setRound({ ...r });
    if (!r.guesses.length && !r.gaveUp) return;
    try {
      const d = await ctxApi(r.gaveUp ? "giveup" : "restore", { token: r.token, guesses: r.guesses, over: r.over });
      if (d.feedback) setRows(d.feedback);
      else setRows([]);
      if (d.answer) setResult(d);
    } catch (e) { recover(e); }
  }
  const ref = () => (mode === "daily" ? memo.daily[st.day] : memo.endless.round);
  function recover(e) {
    if (e.code === "ROUND" || e.code === "DAY") { if (mode === "daily") delete memo.daily[st.day]; else memo.endless.round = null; ctxMem.save(); open(); return; }
    setErr(e.message);
  }
  function finish(r, d, fresh) {
    r.over = true; r.won = d.won;
    if (fresh && mode === "endless") {
      const s = (memo.endless.stats[r.level] ||= { played: 0, wins: 0, streak: 0, best: 0, guesses: 0 });
      s.played++;
      if (d.won) { s.wins++; s.streak++; s.best = Math.max(s.best, s.streak); s.guesses += r.guesses.length; } else s.streak = 0;
      memo.endless.seen = [...memo.endless.seen, d.answer.id].slice(-200);
    }
    setResult(d);
  }
  async function choose(p) {
    const r = ref();
    if (busy || !r || r.over || r.guesses.includes(p.id)) return;
    setBusy(true); setErr(null);
    try {
      const d = await ctxApi("guess", { token: r.token, guesses: [...r.guesses, p.id] });
      r.guesses.push(p.id);
      setRows((x) => [...x, d.feedback]); setLast(d.feedback);
      vibrate(d.won ? [20, 40, 20] : 10);
      if (d.won) finish(r, d, true);
      ctxMem.save(); setRound({ ...r });
    } catch (e) { recover(e); }
    setBusy(false);
  }
  async function hint() {
    const r = ref();
    if (busy || r.over) return;
    setBusy(true);
    try {
      const d = await ctxApi("hint", { token: r.token, guesses: r.guesses });
      r.guesses.push(d.feedback.id); (r.hints ||= []).push(d.feedback.id);
      setRows((x) => [...x, d.feedback]); setLast(d.feedback);
      ctxMem.save(); setRound({ ...r });
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }
  async function surrender() {
    const r = ref();
    setGiveUp(false); setBusy(true);
    try { const d = await ctxApi("giveup", { token: r.token, guesses: r.guesses }); r.gaveUp = true; finish(r, { ...d, won: false }, true); ctxMem.save(); setRound({ ...r }); }
    catch (e) { recover(e); }
    setBusy(false);
  }
  function setLevel(level) {
    const r = memo.endless.round;
    if (r && !r.over && r.guesses.length) { const s = (memo.endless.stats[r.level] ||= { played: 0, wins: 0, streak: 0, best: 0, guesses: 0 }); s.played++; s.streak = 0; }
    memo.endless.level = level; memo.endless.round = null; ctxMem.save(); open();
  }
  const next = () => { memo.endless.round = null; ctxMem.save(); open(); };

  const tabs = [["daily", "Сегодня"], ["endless", "Бесконечный"], ["friends", "С друзьями"]];
  if (mode === "friends") return html`<${ContextoFriends} nav=${nav} st=${st} tabs=${tabs} mode=${mode} setMode=${setMode} join=${join} />`;
  const used = new Set(round?.guesses ?? []);
  const hints = new Set(round?.hints ?? []);
  const sorted = rows.slice().sort((a, b) => a.rank - b.rank);
  const best = sorted[0]?.rank;
  const s = memo.endless.stats[memo.endless.level] || { played: 0, wins: 0, streak: 0, best: 0, guesses: 0 };
  const line = !st ? null : mode === "daily" ? `Загадка дня · новая через ${clock(st.nextAt - (Date.now() + offset.current))}` : `Серия ${s.streak} · рекорд ${s.best} · угадано ${s.wins} из ${s.played}`;
  const n = round?.guesses.length ?? 0;
  return html`<div class="screen-with-bar daily-screen">
    <${GameTop} title="Контекстно" back=${nav.back} mode=${mode} setMode=${pickMode} tabs=${[["daily", "Сегодня"], ["endless", "Бесконечный"], ["friends", "С друзьями"]]}
      levels=${st?.levels} level=${memo.endless.level} setLevel=${setLevel} line=${line} />
    <div class="screen-scroll"><div class="page game-page">
      ${!st && !err ? html`<p class="hint-line pad">Загружаем…</p>` : null}
      ${st && round && !rows.length && !round.over ? html`<div class="dg-empty glass"><img src=${img("game-contexto")} alt="" /><b>Кто загадан?</b>
        <p>Называй футболистов: каждый получает место по близости к загаданному. №1 — он сам. Близость — одноклубники в одни годы, тот же клуб, сборная, поколение, позиция.</p></div>` : null}
      ${result ? html`<div class=${cx("dg-result glass", round?.won ? "won" : "lost")}>
          <small>${round?.won ? `Угадано за ${n} ${plural(n, "попытку", "попытки", "попыток")}${hints.size ? ` · подсказок: ${hints.size}` : ""}` : "Загадан был"}</small>
          <div class="dg-answer"><${Face} p=${{ name: result.answer.name, photo: result.answer.photo }} size=${56} />
            <span><b>${result.answer.name}</b><em>${[result.answer.nat && `${result.answer.nat.flag} ${result.answer.nat.label}`, result.answer.pos, result.answer.born].filter(Boolean).join(" · ")}</em></span></div>
          ${result.answer.career?.length ? html`<div class="ctx-career">${result.answer.career.map((c) => html`<span>${c.logo ? html`<img src=${c.logo} alt="" referrerpolicy="no-referrer" />` : null}<b>${c.name}</b><small>${c.years}</small></span>`)}</div>` : null}
        </div>` : null}
      <div class="dg-list">${sorted.map((f) => html`<${CtxRow} f=${f} total=${st.total} hint=${hints.has(f.id)} why=${result?.why?.[f.id]} fresh=${f.id === last?.id} key=${f.id} />`)}</div>
      ${result?.top?.length ? html`<h4 class="section">БЛИЖЕ ВСЕГО К НЕМУ</h4><div class="dg-list">${result.top.slice(1, 11).map((f) => html`<${CtxRow} f=${f} total=${st.total} why=${f.why} key=${"t" + f.id} />`)}</div>` : null}
      ${err ? html`<p class="hint-line small pad" style="color:#FF9AA8">${err}</p>` : null}
    </div></div>
    <${BottomBar}>
      ${!round ? null : !round.over ? html`
        ${last ? html`<div class="ctx-last"><small>Последняя</small><${CtxRow} f=${last} total=${st.total} hint=${hints.has(last.id)} /></div>` : null}
        <div class="dg-bar">
          <${AskButton} busy=${busy} text=${`Назови футболиста${n ? ` · лучший #${best}` : ""}`} open=${() => setAsking(true)} />
          <button class="round-tool press" aria-label="Подсказка" disabled=${busy || best <= st.hintFloor} onClick=${hint}><img src=${img("question")} alt="" /></button>
          <button class="round-tool press" aria-label="Сдаться" disabled=${busy} onClick=${() => setGiveUp(true)}><img src=${img("finish")} alt="" /></button>
        </div>`
      : mode === "daily" ? html`<div class="two"><button class="primary-btn" onClick=${() => share(`DERBYO · Контекстно #${st.day} · ${round.won ? `${n} ${plural(n, "попытка", "попытки", "попыток")}` : "не угадал"}${hints.size ? ` · 💡${hints.size}` : ""}\nhttps://derbyo.online/contexto`, setErr)}><img src=${img("share")} alt="" />Поделиться</button>
          <button class="navy-btn tall" onClick=${() => setMode("endless")}>Бесконечный</button></div>`
      : html`<button class="primary-btn" onClick=${next}><img src=${img("bolt")} alt="" />Следующий футболист</button>`}
    <//>
    ${asking && round && !round.over ? html`<${Panel} onClose=${() => setAsking(false)} class="answer-panel">${(leave) => html`<${PickSheet}
        head=${html`<b>Попытка ${n + 1}${best ? ` · лучший #${best}` : ""}</b>`} placeholder="Фамилия футболиста…" empty="Начни вводить фамилию — выбери футболиста из списка."
        find=${(q) => ctxApi("search", { query: q }).then((r) => r.players ?? [])} row=${playerRow} used=${used} choose=${choose} dismiss=${leave} />`}<//>` : null}
    ${giveUp ? html`<${Alert} title="Сдаться?" message="Откроем, кто загадан." onClose=${() => setGiveUp(false)}
      actions=${[{ title: "Играть дальше", run: () => setGiveUp(false) }, { title: "Сдаться", kind: "destructive", run: surrender }]} />` : null}
  </div>`;
}

// ———————————————————————————— Что их связывает ————————————————————————————

const lkApi = caller("links");
const lkMem = store("derbyo.links.v1", (m) => { m.daily ||= {}; m.endless = Object.assign({ level: 1, round: null, stats: {} }, m.endless); });

export function LinksView({ nav }) {
  const memo = lkMem.get();
  const [mode, setMode] = useState(() => (memo.appMode === "endless" ? "endless" : "daily"));
  const [st, setSt] = useState(null);
  const [view, setView] = useState(null);
  const [round, setRound] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const [giveUp, setGiveUp] = useState(false);
  const [, tick] = useState(0);
  const offset = useRef(0);
  const shownBefore = useRef(0);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(t); }, []);
  useEffect(() => { lkApi("state").then((s) => { offset.current = s.serverNow - Date.now(); setSt(s); }).catch((e) => setErr(e.message)); }, []);
  useEffect(() => { if (st) open(); }, [st, mode]);

  async function open() {
    setErr(null); setView(null);
    memo.appMode = mode; lkMem.save();
    let r;
    if (mode === "daily") {
      r = memo.daily[st.day];
      if (!r) { const d = await lkApi("start", {}).catch((e) => setErr(e.message)); if (!d) return; r = memo.daily[st.day] = { token: d.token, guesses: [], over: false }; lkMem.save(); }
    } else {
      r = memo.endless.round;
      if (!r) { const d = await lkApi("start", { level: memo.endless.level }).catch((e) => setErr(e.message)); if (!d) return; r = memo.endless.round = { token: d.token, level: d.level, guesses: [], over: false }; lkMem.save(); }
    }
    setRound({ ...r });
    try { const v = await lkApi(r.gaveUp ? "giveup" : "view", { token: r.token, guesses: r.guesses }); shownBefore.current = v.cards.length; setView(v); }
    catch (e) { recover(e); }
  }
  const ref = () => (mode === "daily" ? memo.daily[st.day] : memo.endless.round);
  function recover(e) {
    if (e.code === "ROUND" || e.code === "DAY") { if (mode === "daily") delete memo.daily[st.day]; else memo.endless.round = null; lkMem.save(); open(); return; }
    setErr(e.message);
  }
  const score = (v) => (v?.won ? st.cards - v.guesses.filter((g) => !g.ok).length : 0);
  function finish(r, v, fresh) {
    r.over = true; r.won = v.won;
    if (fresh && mode === "endless") {
      const s = (memo.endless.stats[r.level] ||= { played: 0, wins: 0, streak: 0, best: 0, points: 0 });
      s.played++;
      if (v.won) { s.wins++; s.streak++; s.best = Math.max(s.best, s.streak); s.points += score(v); } else s.streak = 0;
    }
  }
  async function choose(link) {
    const r = ref();
    if (busy || !r || r.over || r.guesses.includes(link.id)) return;
    setBusy(true); setErr(null);
    try {
      const v = await lkApi("guess", { token: r.token, guesses: [...r.guesses, link.id] });
      r.guesses.push(link.id);
      shownBefore.current = view?.cards.length ?? 0;
      vibrate(v.won ? [20, 40, 20] : 10);
      if (v.over) finish(r, v, true);
      lkMem.save(); setRound({ ...r }); setView(v);
    } catch (e) { recover(e); }
    setBusy(false);
  }
  async function surrender() {
    const r = ref();
    setGiveUp(false); setBusy(true);
    try { const v = await lkApi("giveup", { token: r.token, guesses: r.guesses }); r.gaveUp = true; finish(r, v, true); lkMem.save(); setRound({ ...r }); setView(v); }
    catch (e) { recover(e); }
    setBusy(false);
  }
  function setLevel(level) {
    const r = memo.endless.round;
    if (r && !r.over && r.guesses.length) { const s = (memo.endless.stats[r.level] ||= { played: 0, wins: 0, streak: 0, best: 0, points: 0 }); s.played++; s.streak = 0; }
    memo.endless.level = level; memo.endless.round = null; lkMem.save(); open();
  }
  const next = () => { memo.endless.round = null; lkMem.save(); open(); };

  const used = new Set(round?.guesses ?? []);
  const s = memo.endless.stats[memo.endless.level] || { played: 0, wins: 0, streak: 0, best: 0, points: 0 };
  const line = !st ? null : mode === "daily" ? `Загадка дня · новая через ${clock(st.nextAt - (Date.now() + offset.current))}` : `Серия ${s.streak} · рекорд ${s.best} · очков ${s.points}`;
  const wrong = view ? view.guesses.filter((g) => !g.ok).length : 0;
  const total = st?.cards ?? 5;
  const careers = Object.fromEntries((view?.careers ?? []).map((c) => [c.id, c.clubs]));
  return html`<div class="screen-with-bar daily-screen">
    <${GameTop} title="Что их связывает" back=${nav.back} mode=${mode} setMode=${setMode} tabs=${[["daily", "Сегодня"], ["endless", "Бесконечный"]]}
      levels=${st?.levels} level=${memo.endless.level} setLevel=${setLevel} line=${line} />
    <div class="screen-scroll"><div class="page game-page">
      ${!st && !err ? html`<p class="hint-line pad">Загружаем…</p>` : null}
      ${view && !view.guesses.length && !view.over ? html`<div class="dg-empty glass"><img src=${img("game-links")} alt="" /><b>Пять футболистов, одна связь</b>
        <p>Клуб, сборная, тренер или трофей. Сначала виден один футболист; каждый неверный ответ открывает следующего. Чем раньше угадаешь, тем больше очков.</p></div>` : null}
      ${view?.over ? html`<div class=${cx("dg-result glass", view.won ? "won" : "lost")}>
          <small>${view.won ? `Угадано · очков ${score(view)} из ${total}` : view.gaveUp ? "Ответ" : "Не угадано. Связь —"}</small>
          <div class="lk-answer"><b>${view.answer.label}</b><em>${view.answer.kind}</em></div>
          ${view.also ? html`<small>Твой ответ «${view.also.label}» тоже подходит</small>` : null}
        </div>` : null}
      <div class="dg-list">
        ${Array.from({ length: total }, (_, i) => {
          const p = view?.cards[i];
          return p ? html`<div class=${cx("lk-card glass", i >= shownBefore.current && "fresh")} key=${p.id}>
              <${Face} p=${{ name: p.name, photo: p.photo }} size=${48} />
              <span class="lk-who"><b>${p.name}</b><small>${[p.pos, p.born].filter(Boolean).join(" · ")}</small>
                ${view.over && careers[p.id]?.length ? html`<em>${careers[p.id].join(" · ")}</em>` : null}</span>
              <i>${i + 1}</i></div>`
            : html`<div class="lk-card locked" key=${"l" + i}><span class="lk-lock"><img src=${img("lock")} alt="" /></span><span class="lk-who"><b>Футболист ${i + 1}</b><small>откроется после неверного ответа</small></span></div>`;
        })}
      </div>
      ${view?.guesses.length ? html`<h4 class="section">ТВОИ ОТВЕТЫ</h4><div class="lk-guesses">${view.guesses.map((g) => html`<span class=${cx("lk-guess", g.ok ? "ok" : "no")}>${g.ok ? "✓" : "✕"} ${g.label}<small>${g.kind}</small></span>`)}</div>` : null}
      ${err ? html`<p class="hint-line small pad" style="color:#FF9AA8">${err}</p>` : null}
    </div></div>
    <${BottomBar}>
      ${!view || !round ? null : !view.over ? html`<div class="dg-bar">
          <${AskButton} busy=${busy} text=${`Назови связь · ${wrong + 1} из ${total}`} open=${() => setAsking(true)} />
          <button class="round-tool press" aria-label="Сдаться" disabled=${busy} onClick=${() => setGiveUp(true)}><img src=${img("finish")} alt="" /></button></div>`
      : mode === "daily" ? html`<div class="two"><button class="primary-btn" onClick=${() => {
          const marks = view.guesses.map((g) => (g.ok ? "🟩" : "🟥")); while (marks.length < total) marks.push("⬜");
          share(`DERBYO · Что их связывает #${st.day} · ${view.won ? score(view) : "X"}/${total}\n${marks.join("")}\nhttps://derbyo.online/links`, setErr); }}><img src=${img("share")} alt="" />Поделиться</button>
          <button class="navy-btn tall" onClick=${() => setMode("endless")}>Бесконечный</button></div>`
      : html`<button class="primary-btn" onClick=${next}><img src=${img("bolt")} alt="" />Следующая загадка</button>`}
    <//>
    ${asking && view && !view.over ? html`<${Panel} onClose=${() => setAsking(false)} class="answer-panel">${(leave) => html`<${PickSheet}
        head=${html`<b>Ответ ${wrong + 1} из ${total}</b><small class="lk-sub">клуб, сборная, тренер или трофей</small>`} placeholder="Клуб, сборная, тренер…" empty="Начни вводить: Реал, Бразилия, Гвардиола, Лига чемпионов…"
        find=${(q) => lkApi("search", { query: q }).then((r) => r.links ?? [])} row=${(x, u) => html`<span class="lk-kind">${x.kind}</span><span class="hit-name"><b>${x.label}</b><small>${u ? "уже было" : x.kind}</small></span>`}
        used=${used} choose=${choose} dismiss=${leave} />`}<//>` : null}
    ${giveUp ? html`<${Alert} title="Сдаться?" message="Откроем всех футболистов и связь." onClose=${() => setGiveUp(false)}
      actions=${[{ title: "Играть дальше", run: () => setGiveUp(false) }, { title: "Сдаться", kind: "destructive", run: surrender }]} />` : null}
  </div>`;
}

// ———————————————————————————— Контекстно · с друзьями ————————————————————————————
// One hidden player per round and one shared list: everyone sees every guess and its author; whoever names №1 first wins.
// The room lives on the server (contexto-rooms.mjs): eight seats play, the rest watch from the stands; a chat for all.
// The lobby and the room look like the tic-tac-toe ones (live.js). The name is the account's: a nickname, or «ГостьNNNN».

const roomCall = (route, body = {}, secret) => fetch(`/api/contexto/room/${route}`, { method: "POST",
  headers: { "Content-Type": "application/json", ...(secret ? { Authorization: "Bearer " + secret } : {}) }, body: JSON.stringify(body) })
  .then((r) => r.json().catch(() => ({ ok: false, error: "Сервер недоступен." })))
  .then((d) => { if (!d.ok) throw Object.assign(new Error(d.error || "Ошибка."), { code: d.code }); return d; });
const spaced = (code) => `${code.slice(0, 3)} ${code.slice(3)}`;

const SEAT_TINT = ["#FF5364", "#32E5A1", "#6FA8FF", "#F6D482", "#BC8CFF", "#FF9A52", "#4FD6E8", "#FF7AC8"];

/** Eight seats in one glass bubble, like the duel in tic-tac-toe: a free seat takes you in, your own seat stands you up. */
function Seats({ v, sit }) {
  const bySeat = new Map(v.players.map((p) => [p.seat, p]));
  const meSeated = v.players.some((p) => p.id === v.you);
  return html`<div class="ctx-seats glass">
    <div class="ctx-seats-head"><small class="cap">ЗА СТОЛОМ</small><b>${v.players.length}<i> / ${v.seats ?? 8}</i></b></div>
    <div class="ctx-seat-grid">${Array.from({ length: v.seats ?? 8 }, (_, i) => {
      const p = bySeat.get(i);
      if (!p) return html`<button class=${cx("ctx-seat free press", !meSeated && "call")} onClick=${() => sit(i)} aria-label=${`Сесть на место ${i + 1}`}>
        <span class="ctx-av free"><img src=${img("plus")} alt="" /></span><small>${meSeated ? "пересесть" : "сесть"}</small></button>`;
      const me = p.id === v.you;
      return html`<button class=${cx("ctx-seat press", me && "me", p.id === v.winner && "won")} style=${`--t:${SEAT_TINT[i]}`}
          onClick=${me && v.status !== "playing" ? () => sit(null) : null} aria-label=${me ? "Встать на трибуну" : p.name}>
        <span class="ctx-av"><b>${p.name.slice(0, 2).toUpperCase()}</b>
          ${p.id === v.host ? html`<img class="ctx-key" src=${img("key")} alt="создатель" />` : null}</span>
        <b class="ctx-seat-name">${me ? "Ты" : p.name}</b>
        <small>${p.id === v.winner ? "угадал!" : p.best ? `лучший #${p.best}` : me ? "встать" : "на месте"}</small></button>`;
    })}</div>
    ${meSeated ? null : html`<p class="ctx-seat-hint">Ты на трибуне — нажми на свободное место, чтобы играть</p>`}
  </div>`;
}

/** The hint clock as the match's turn dial: the ring drains until the next hint opens for everyone. */
function HintDial({ left, total, size = 48 }) {
  const fill = left === null ? 0 : Math.min(1, left / total);
  const tint = left === null ? "#A8B8CA" : left <= 10 ? "#F6D482" : "#6FA8FF";
  const R = 45, C = 2 * Math.PI * R;
  return html`<span class="dial" style=${`width:${size}px;height:${size}px`} aria-label=${left === null ? "Подсказок больше не будет" : `Подсказка через ${left} секунд`}>
    <svg viewBox="0 0 100 100">
      <circle cx="50" cy="50" r="48" fill="rgba(0,0,0,.3)" />
      <circle cx="50" cy="50" r=${R} fill="none" stroke="#1D2C3D" stroke-width="9.5" />
      <circle class="arc" cx="50" cy="50" r=${R} fill="none" stroke=${tint} stroke-width="9.5" stroke-linecap="round"
        stroke-dasharray=${C} stroke-dashoffset=${C * (1 - fill)} transform="rotate(-90 50 50)" style=${`filter:drop-shadow(0 0 4px ${tint}8c)`} />
    </svg>
    <span class="dial-in">${left === null ? html`<img class="pict" src=${img("stopwatch")} alt="" />`
      : html`<b class=${left >= 100 ? "ctx-dial-long" : ""} style=${left <= 10 ? "color:#F6D482" : ""}>${left >= 100 ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}` : left}</b>`}</span>
  </span>`;
}

/** The round opens behind closing doors, as a tic-tac-toe match does: the table on one side, the level on the other, a 5-second count. */
function CtxIntro({ v, level, done }) {
  const [n, setN] = useState(5);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let left = 5;
    const hit = setTimeout(() => vibrate([30, 30, 20]), 480);
    const tick = setInterval(() => {
      left -= 1;
      if (left > 0) { setN(left); vibrate(left === 1 ? 25 : 8); }
      else { clearInterval(tick); setOpen(true); setTimeout(done, 700); }
    }, 1000);
    return () => { clearInterval(tick); clearTimeout(hit); };
  }, []);
  const skip = () => { if (!open) { setOpen(true); setTimeout(done, 700); } };
  const players = v.players.slice().sort((a, b) => a.seat - b.seat);
  return html`<div class=${cx("match-intro ctx-intro", open && "open")} onClick=${skip} role="dialog" aria-label=${`Раунд ${v.round}, старт через ${n}`}>
    <div class="intro-bg"></div>
    <div class="intro-door l red"><div class="intro-player">
      <span class="intro-face"><img class="bot" src=${img("game-contexto")} alt="" /></span>
      <b class="intro-name">Раунд ${v.round}</b>
      <span class="intro-rating"><small>Кто загадан?</small></span>
    </div></div>
    <div class="intro-door r green"><div class="intro-player">
      <div class="ctx-intro-faces">${players.map((p) => html`<span class=${cx("ctx-intro-face", p.id === v.you && "me")} style=${`--t:${SEAT_TINT[p.seat]}`}>
        <b>${p.name.slice(0, 2).toUpperCase()}</b><small>${p.id === v.you ? "Ты" : p.name}</small></span>`)}</div>
    </div></div>
    <svg class="intro-seam" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><line x1="58" y1="-2" x2="42" y2="102" /></svg>
    <div class="intro-flash"></div>
    <div class="intro-center">
      ${level ? html`<small class="intro-level">${level}</small>` : null}
      <span class="intro-vs"><svg viewBox="0 0 100 100" aria-hidden="true"><circle class="track" cx="50" cy="50" r="46" /><circle class="drain" cx="50" cy="50" r="46" pathLength="100" /></svg><i>№1</i></span>
      <b class="intro-count" key=${n}>${n}</b>
    </div>
  </div>`;
}

/** The room's chat as the match's chat sheet. */
function CtxChatSheet({ v, say }) {
  const [text, setText] = useState("");
  const list = useRef();
  const chat = v.chat ?? [];
  useEffect(() => { const el = list.current; if (el) el.scrollTop = el.scrollHeight; }, [chat.length]);
  const send = (e) => { e.preventDefault(); const t = text.trim(); if (!t) return; say(t); setText(""); };
  return html`<div class="chat">
    <div class="chat-head"><h2>Чат комнаты</h2><span class="sp"></span></div>
    <div class="chat-list" ref=${list}>${chat.length ? chat.map((x) => html`<div class=${cx("msg", x.by === v.you && "me")}>
        <span class="who"><span>${x.by === v.you ? "Ты" : x.name}</span></span><span class="text">${x.text}</span></div>`)
      : html`<p class="talk-empty">Пока тихо — напиши первым</p>`}</div>
    <form class="answer-row" onSubmit=${send} action="#">
      <span class="field chat-field">
        <input value=${text} maxlength="200" onInput=${(e) => setText(e.target.value)} placeholder="Напиши сообщение" enterkeyhint="send" autocomplete="off" />
        <button type="submit" class=${cx("send", text.trim() && "on")} disabled=${!text.trim()} aria-label="Отправить"><${Icon} name="up" size="17" weight="3" /></button>
      </span>
    </form>
  </div>`;
}

/** The room's chat and stands, the same card as in tic-tac-toe. */
function CtxTalk({ v, say }) {
  const [tab, setTab] = useState("chat");
  const [draft, setDraft] = useState("");
  const list = useRef();
  const chat = v.chat ?? [], watchers = v.watchers ?? [];
  useEffect(() => { if (list.current) list.current.scrollTop = list.current.scrollHeight; }, [chat.length, tab]);
  const send = (e) => { e.preventDefault(); const t = draft.trim(); if (!t) return; say(t); setDraft(""); };
  return html`<div class="talk glass">
    <div class="segmented talk-tabs">
      <button class=${tab === "chat" ? "on" : ""} onClick=${() => setTab("chat")}><img src=${img("chat")} alt="" />Чат${chat.length ? html` <i>${chat.length}</i>` : null}</button>
      <button class=${tab === "stands" ? "on" : ""} onClick=${() => setTab("stands")}><img src=${img("eye")} alt="" />Трибуна <i>${watchers.length}</i></button>
    </div>
    ${tab === "chat" ? html`
      ${chat.length ? html`<div class="chat-list inline talk-list" ref=${list}>${chat.map((x) => html`<div class=${cx("msg", x.by === v.you && "me")}>
        <span class="who"><span>${x.by === v.you ? "Ты" : x.name}</span></span><span class="text">${x.text}</span></div>`)}</div>` : null}
      <form class="mini-field" onSubmit=${send} action="#">
        <input value=${draft} maxlength="200" onInput=${(e) => setDraft(e.target.value)} placeholder=${chat.length ? "Сообщение" : "Пока тихо — напиши первым"} enterkeyhint="send" autocomplete="off" />
        <button type="submit" class=${cx("send", draft.trim() && "on")} disabled=${!draft.trim()} aria-label="Отправить"><${Icon} name="up" size="16" weight="3" /></button>
      </form>`
      : watchers.length ? html`<div class="ctx-watchers">${watchers.map((w) => html`<span class=${cx("ctx-watcher", w.id === v.you && "me")}>${w.id === v.you ? "Ты" : w.name}</span>`)}</div>`
      : html`<p class="talk-empty">На трибуне пока никого. Кто войдёт по коду, сядет сюда, пока не займёт место.</p>`}
  </div>`;
}

function ContextoFriends({ nav, st, tabs, mode, setMode, join }) {
  const memo = ctxMem.get();
  const [seat, setSeat] = useState(memo.room ?? null);
  const [view, setView] = useState(null);
  const [step, setStep] = useState(join && !memo.room ? "code" : null);
  const [digits, setDigits] = useState(join ?? "");
  const [focused, setFocused] = useState(false);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [intro, setIntro] = useState(null);
  const [showRoom, setShowRoom] = useState(false);
  const chatSeen = useRef(0);
  const [, tick] = useState(0);
  const clockOff = useRef(0);
  const lastSeen = useRef(0);
  const codeRef = useRef();
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(t); }, []);
  useEffect(() => { if (step === "code") codeRef.current?.focus(); }, [step]);
  // The room's live state: one stream per seat, reconnecting with a growing pause.
  useEffect(() => {
    if (!seat) { setView(null); return; }
    const ctl = new AbortController();
    let delay = 1000;
    (async () => {
      while (!ctl.signal.aborted) {
        try {
          const r = await fetch(`/api/contexto/room/events?code=${seat.code}`, { headers: { Authorization: "Bearer " + seat.secret }, signal: ctl.signal });
          if (!r.ok) {
            const d = await r.json().catch(() => ({}));
            if (["ROOM", "AUTH"].includes(d.code)) { drop(d.error); return; }
            throw new Error(d.error);
          }
          delay = 1000;
          const rd = r.body.getReader(), dec = new TextDecoder();
          let buf = "";
          for (;;) {
            const { value, done } = await rd.read();
            if (done) break;
            buf += dec.decode(value, { stream: true });
            let at;
            while ((at = buf.indexOf("\n\n")) >= 0) {
              const chunk = buf.slice(0, at); buf = buf.slice(at + 2);
              if (chunk.startsWith("data: ")) { const v = JSON.parse(chunk.slice(6)); clockOff.current = v.serverNow - Date.now(); setView(v); }
            }
          }
        } catch { if (ctl.signal.aborted) return; }
        await new Promise((r) => setTimeout(r, delay));
        delay = Math.min(delay * 2, 15000);
      }
    })();
    return () => ctl.abort();
  }, [seat?.secret]);
  function drop(text) { memo.room = null; ctxMem.save(); setSeat(null); setView(null); setStep(null); if (text) setErr(text); }
  const call = async (route, body = {}) => {
    setErr(null);
    try { return await roomCall(route, { code: seat.code, ...body }, seat.secret); }
    catch (e) { if (["ROOM", "AUTH"].includes(e.code)) drop(e.message); else setErr(e.message); }
  };
  // The name is the account's own; a guest is always «ГостьNNNN».
  async function enter(route) {
    setBusy(true); setErr(null);
    try {
      const d = await roomCall(route, route === "join" ? { name: account.name, code: digits, watch: true } : { name: account.name, level: memo.endless.level || 1 });
      memo.room = { code: d.code, secret: d.secret, playerId: d.playerId }; ctxMem.save(); setSeat(memo.room); setStep(null);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }
  const link = () => `${location.origin}/#ctx=${seat.code}`;
  const share = async () => {
    const text = `Сыграем в «Контекстно» в DERBYO? Комната ${spaced(seat.code)}\n${link()}`;
    try { if (navigator.share) { await navigator.share({ text }); return; } } catch (e) { if (e.name === "AbortError") return; }
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
  };
  const copy = async () => { try { await navigator.clipboard.writeText(seat.code); } catch {} setCopied(true); setTimeout(() => setCopied(false), 1500); };
  const paste = async () => { try { const t = await navigator.clipboard.readText(); setDigits(t.replace(/\D/g, "").slice(0, 6)); } catch {} };
  const leave = async () => { setLeaving(false); await call("leave"); drop(); };

  const v = view, you = v?.you, host = v && v.host === you;
  const seated = !!v?.players.some((p) => p.id === you);
  const names = new Map([...(v?.players ?? []), ...(v?.watchers ?? [])].map((p) => [p.id, p.name]));
  const sorted = (v?.guesses ?? []).slice().sort((a, b) => a.rank - b.rank);
  const used = new Set((v?.guesses ?? []).map((g) => g.id));
  const last = v?.guesses?.at(-1);
  const fresh = v && v.guesses.length > lastSeen.current ? last?.id : null;
  if (v) lastSeen.current = v.guesses.length;
  const hintLeft = v?.nextHintAt ? Math.max(0, Math.ceil((v.nextHintAt - (Date.now() + clockOff.current)) / 1000)) : null;
  const level = st?.levels?.find((l) => l.level === v?.level);
  const playing = v?.status === "playing";
  // A finished round stays on the game screen with its answer; the room (seats, level) is one tap away in the menu.
  useEffect(() => setShowRoom(false), [v?.round]);
  const inGame = playing || (v?.status === "done" && !showRoom);
  // The round is a match: the app's tab bar steps aside, as it does for tic-tac-toe.
  useEffect(() => { document.body.classList.toggle("ctx-full", inGame); return () => document.body.classList.remove("ctx-full"); }, [inGame]);
  // Doors only at a round's very start, not when coming back to one already under way.
  const fresh0 = playing && !v.guesses.length && hintLeft !== null && hintLeft > 110 ? `${v.code}-${v.round}` : null;
  useEffect(() => {
    if (!fresh0) return;
    try { if (sessionStorage.getItem("ctx-intro-" + fresh0)) return; sessionStorage.setItem("ctx-intro-" + fresh0, "1"); } catch {}
    setIntro(fresh0);
  }, [fresh0]);
  if (chatOpen && v) chatSeen.current = v.chat?.length ?? 0;
  const unread = Math.max(0, (v?.chat?.length ?? 0) - chatSeen.current);
  const freeSeat = v ? Array.from({ length: v.seats ?? 8 }, (_, i) => i).find((i) => !v.players.some((p) => p.seat === i)) : undefined;
  const line = step === "code" ? "Введи 6 цифр, которые прислал друг"
    : !seat ? "Один загаданный на всех, общий список вариантов. Кто первым назовёт №1 — выиграл раунд."
    : !v ? "Подключаемся…"
    : v.status === "playing" ? `Вариантов ${v.guesses.length}${hintLeft !== null ? ` · подсказка для всех через ${Math.floor(hintLeft / 60)}:${String(hintLeft % 60).padStart(2, "0")}` : v.hintsGiven ? " · подсказок больше не будет" : ""}`
    : `Игроков ${v.players.length} из ${v.seats ?? 8}${v.watchers?.length ? ` · на трибуне ${v.watchers.length}` : ""}`;
  const list = v && sorted.length ? html`<div class="dg-list">${sorted.map((f) => html`<div class="ctx-by-wrap" key=${f.id}>
      <${CtxRow} f=${f} total=${v.total} hint=${f.hint} why=${v.result?.why?.[f.id]} fresh=${f.id === fresh} />
      ${f.by ? html`<span class=${cx("ctx-by", f.by === you && "me")}>${f.by === you ? "ты" : names.get(f.by) ?? "игрок"}</span>` : null}</div>`)}</div>` : null;

  const menuRow = (title, run, destructive) => html`<button class=${cx("navy-btn menu-row", destructive && "destructive")} onClick=${() => { setMenuOpen(false); run(); }}>${title}</button>`;
  const sheets = html`
    ${asking && playing ? html`<${Panel} onClose=${() => setAsking(false)} class="answer-panel">${(leaveSheet) => html`<${PickSheet}
        head=${html`<b>${sorted[0] ? `Лучший в комнате #${sorted[0].rank}` : "Первый вариант в комнате"}</b>`} placeholder="Фамилия футболиста…" empty="Начни вводить фамилию — выбери футболиста из списка."
        find=${(q) => ctxApi("search", { query: q }).then((r) => r.players ?? [])} row=${playerRow} used=${used}
        choose=${async (p) => { setBusy(true); await call("guess", { id: p.id }); vibrate(10); setBusy(false); }} dismiss=${leaveSheet} />`}<//>` : null}
    ${chatOpen && v ? html`<${Panel} onClose=${() => setChatOpen(false)} class="chat-panel"><${CtxChatSheet} v=${v} say=${(text) => call("say", { text })} /><//>` : null}
    ${menuOpen && v ? html`<${Panel} onClose=${() => setMenuOpen(false)}><div class="menu ctx-menu-sheet">
        <h2>Комната ${spaced(seat.code)}</h2>
        ${menuRow("Пригласить друзей", share)}
        ${inGame && !playing ? menuRow("Места и уровень", () => setShowRoom(true)) : null}
        ${host && playing ? menuRow("Остановить раунд — открыть ответ", () => call("giveup"), true) : null}
        ${seated && !playing ? menuRow("Встать на трибуну", () => call("sit", { seat: null })) : null}
        ${menuRow("Выйти из комнаты", () => setLeaving(true), true)}
      </div><//>` : null}
    ${leaving ? html`<${Alert} title="Выйти из комнаты?" message="Вернуться можно по коду, если комната ещё открыта." onClose=${() => setLeaving(false)}
      actions=${[{ title: "Остаться", run: () => setLeaving(false) }, { title: "Выйти", kind: "destructive", run: leave }]} />` : null}`;

  // The round: the answer field on top, the shared list in the middle, the hint clock with chat and menu at the bottom — the match's trays.
  const result = v?.result ? html`<div class=${cx("dg-result glass", v.winner === you ? "won" : "lost")}>
      <small>${v.gaveUp ? "Раунд остановлен · загадан был" : v.winner === you ? "Ты угадал первым!" : `Первым угадал ${names.get(v.winner) ?? "кто-то"}`}</small>
      <div class="dg-answer"><${Face} p=${{ name: v.result.answer.name, photo: v.result.answer.photo }} size=${56} />
        <span><b>${v.result.answer.name}</b><em>${[v.result.answer.nat && `${v.result.answer.nat.flag} ${v.result.answer.nat.label}`, v.result.answer.pos, v.result.answer.born].filter(Boolean).join(" · ")}</em></span></div>
    </div>` : null;
  const next = () => call("start", { level: v.level });
  if (inGame) return html`<div class="screen-with-bar daily-screen ctx-round">
    <div class="game-top">
      <${LobbyHeader} title=${`Контекстно · раунд ${v.round}`} back=${nav.back} />
      ${!playing ? result : seated ? html`<${AskButton} busy=${busy} text=${`Назови футболиста${sorted[0] ? ` · лучший #${sorted[0].rank}` : ""}`} open=${() => setAsking(true)} />`
        : html`<button class="primary-btn" disabled=${freeSeat === undefined} onClick=${() => call("sit", { seat: freeSeat })}>
            <img src=${img("plus")} alt="" />${freeSeat === undefined ? "Все 8 мест заняты — ты на трибуне" : "Сесть за стол и играть"}</button>`}
    </div>
    <div class="screen-scroll"><div class="page game-page">
      ${playing && last ? html`<div class="ctx-last"><small>Последний вариант · ${last.by === you ? "твой" : last.by ? names.get(last.by) : "подсказка для всех"}</small><${CtxRow} f=${last} total=${v.total} hint=${last.hint} /></div>` : null}
      ${list ?? html`<div class="dg-empty glass"><img src=${img("game-contexto")} alt="" /><b>Кто загадан?</b>
        <p>Называйте футболистов — каждый получит место по близости к загаданному. Кто первым назовёт №1, выиграл раунд.</p></div>`}
      ${err ? html`<p class="hint-line small pad" style="color:#FF9AA8">${err}</p>` : null}
    </div></div>
    <div class="tray-row ctx-trays">
      ${!playing ? html`<div class=${cx("tray turn-tray glass", host && "over")}>
        ${host ? html`<button class="primary-btn ctx-next" onClick=${next}><img src=${img("bolt")} alt="" />Следующий раунд</button>`
          : html`<${HintDial} left=${null} total=${1} /><span class="tray-label"><b>Раунд окончен</b><small>следующий начнёт создатель</small></span>`}
      </div>`
      : html`<div class="tray turn-tray glass">
        <${HintDial} left=${hintLeft} total=${v.hintsGiven ? 90 : 120} />
        <span class="tray-label"><b style=${hintLeft !== null && hintLeft <= 10 ? "color:#F6D482" : ""}>${hintLeft === null ? "Подсказок больше не будет" : hintLeft <= 0 ? "Открываем подсказку…" : "Подсказка для всех"}</b>
          <small>${v.guesses.length} ${plural(v.guesses.length, "вариант", "варианта", "вариантов")}${sorted[0] ? ` · лучший #${sorted[0].rank}` : ""}</small></span>
      </div>`}
      <div class="tray tools-tray glass">
        <button class="tool press" onClick=${() => setChatOpen(true)} aria-label=${unread ? `Чат, новых сообщений: ${unread}` : "Чат"}>
          <img src=${img("chat")} alt="" />${unread ? html`<b class="badge">${unread}</b>` : null}</button>
        <i class="tool-sep"></i>
        <button class="tool press" onClick=${() => setMenuOpen(true)} aria-label="Меню комнаты"><img src=${img("menu")} alt="" /></button>
      </div>
    </div>
    ${sheets}
    ${intro ? html`<${CtxIntro} v=${v} level=${level?.label} key=${intro} done=${() => setIntro(null)} />` : null}
  </div>`;

  return html`<div class="screen-with-bar daily-screen">
    <${GameTop} title="Контекстно" back=${step ? () => { setStep(null); setErr(null); } : nav.back} mode=${mode} setMode=${(m) => { setStep(null); setMode(m); }} tabs=${tabs} line=${line} />
    <div class="screen-scroll"><div class="page game-page">
      ${step === "code" ? html`
        <label class="code-boxes ctx-code-boxes">
          <input ref=${codeRef} inputmode="numeric" autocomplete="one-time-code" value=${digits} onFocus=${() => setFocused(true)} onBlur=${() => setFocused(false)}
            onInput=${(e) => { const d = e.target.value.replace(/\D/g, "").slice(0, 6); e.target.value = d; setDigits(d); setErr(null); }} aria-label="Код комнаты" />
          ${[0, 1, 2, 3, 4, 5].map((i) => html`${i === 3 ? html`<i class="dash">–</i>` : null}<span class=${cx("box", i === digits.length && focused && "cur")}>${digits[i] ?? ""}</span>`)}
        </label>
        <button class="text-btn muted" onClick=${paste}><${Icon} name="paste" size="15" />Вставить из буфера</button>`
      : !seat ? html`<div class="dg-empty glass">
          <img src=${img("game-contexto")} alt="" /><b>Сыграйте вместе</b>
          <p>До 8 игроков за одним загаданным, остальные смотрят с трибуны. Подсказки открываются для всех сами: первая через 2 минуты, потом каждые полторы.</p>
          <p class="ctx-as">Ты играешь как <b>${account.name}</b></p>
        </div>`
      : !v ? null
      : html`
        <div class="code-bar glass">
          <span class="cb-t"><small class="cap">КОД КОМНАТЫ</small><b class="cb-code">${spaced(seat.code)}</b></span>
          <button class="cb-btn press" onClick=${copy} aria-label="Скопировать код"><${Icon} name=${copied ? "check" : "copy"} size="18" /></button>
          <button class="cb-btn main press" onClick=${share} aria-label="Поделиться"><${Icon} name="share" size="18" /></button>
        </div>
        <p class="hint-line small pad">${copied ? "Скопировано — отправь друзьям" : "Друзья войдут по коду во вкладке «С друзьями» или по ссылке."}</p>
        <${Seats} v=${v} sit=${(i) => call("sit", { seat: i })} />
        ${host ? html`<div class="ctx-level glass"><small class="cap">УРОВЕНЬ ДЛЯ РАУНДА</small>
            <div class="dg-levels">${(st?.levels ?? []).map((l) => html`<button class=${cx("dg-level press", v.level === l.level && "on")} style=${`--t:${LEVEL_TINT[l.level]}`}
              onClick=${() => v.level !== l.level && call("settings", { level: l.level })}><img src=${img(LEVEL_ICON[l.level])} alt="" /><b>${l.label}</b></button>`)}</div></div>`
          : html`<div class="settings-card ctx-settings">
            <img src=${img(LEVEL_ICON[v.level] ?? "settings")} alt="" />
            <span><small>Уровень · выбирает создатель</small><b>${level?.label ?? "—"}</b></span></div>`}
        <${CtxTalk} v=${v} say=${(text) => call("say", { text })} />`}
      ${err ? html`<p class="hint-line small pad" style="color:#FF9AA8">${err}</p>` : null}
    </div></div>
    <${BottomBar}>
      ${step === "code" ? html`<button class="primary-btn" disabled=${digits.length < 6 || busy} onClick=${() => enter("join")}>${busy ? html`<span class="spinner"></span>` : "Войти"}</button>`
      : !seat ? html`<section class="mode-group glass ctx-menu">
          <div class="two">
            <button class="navy-btn tall" disabled=${busy} onClick=${() => enter("create")}><img src=${img("invite")} alt="" />Создать</button>
            <button class="mint-btn tall press" onClick=${() => { setErr(null); setStep("code"); }}><img src=${img("arrow")} alt="" />По коду</button>
          </div></section>`
      : !v ? null
      : html`<div class="dg-bar">
          ${host ? html`<button class="primary-btn" disabled=${!v.players.length} onClick=${() => call("start", { level: v.level })}><img src=${img("bolt")} alt="" />${v.round ? "Следующий раунд" : "Начать раунд"}</button>`
            : html`<span class="dg-wait">${v.round ? "Следующий раунд начнёт создатель" : "Ждём, когда создатель начнёт"}</span>`}
          <button class="round-tool press" aria-label="Выйти из комнаты" onClick=${() => setLeaving(true)}><img src=${img("logout")} alt="" /></button>
        </div>`}
    <//>
    ${sheets}
  </div>`;
}
