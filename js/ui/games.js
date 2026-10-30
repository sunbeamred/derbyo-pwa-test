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
  const pick = (x) => { if (!used.has(x.id)) { choose(x); dismiss(); } };
  return html`<div class="answer">
    ${head ? html`<div class="cond-bubble glass dg-ask">${head}</div>` : null}
    <div class="answer-scroll">
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

  const tabs = [["daily", st ? `Дня · №${st.day}` : "Дня"], ["endless", "Бесконечный"], ["friends", "С друзьями"]];
  if (mode === "friends") return html`<${ContextoFriends} nav=${nav} st=${st} tabs=${tabs} mode=${mode} setMode=${setMode} join=${join} />`;
  const used = new Set(round?.guesses ?? []);
  const hints = new Set(round?.hints ?? []);
  const sorted = rows.slice().sort((a, b) => a.rank - b.rank);
  const best = sorted[0]?.rank;
  const s = memo.endless.stats[memo.endless.level] || { played: 0, wins: 0, streak: 0, best: 0, guesses: 0 };
  const line = !st ? null : mode === "daily" ? `Загадка дня · новая через ${clock(st.nextAt - (Date.now() + offset.current))}` : `Серия ${s.streak} · рекорд ${s.best} · угадано ${s.wins} из ${s.played}`;
  const n = round?.guesses.length ?? 0;
  return html`<div class="screen-with-bar daily-screen">
    <${GameTop} title="Контекстно" back=${nav.back} mode=${mode} setMode=${pickMode} tabs=${[["daily", st ? `Дня · №${st.day}` : "Дня"], ["endless", "Бесконечный"], ["friends", "С друзьями"]]}
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
    <${GameTop} title="Что их связывает" back=${nav.back} mode=${mode} setMode=${setMode} tabs=${[["daily", st ? `Дня · №${st.day}` : "Дня"], ["endless", "Бесконечный"]]}
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
// The room lives on the server (contexto-rooms.mjs); this phone keeps its seat (code + secret) in the site's own memory.

const roomCall = (route, body = {}, secret) => fetch(`/api/contexto/room/${route}`, { method: "POST",
  headers: { "Content-Type": "application/json", ...(secret ? { Authorization: "Bearer " + secret } : {}) }, body: JSON.stringify(body) })
  .then((r) => r.json().catch(() => ({ ok: false, error: "Сервер недоступен." })))
  .then((d) => { if (!d.ok) throw Object.assign(new Error(d.error || "Ошибка."), { code: d.code }); return d; });

function ContextoFriends({ nav, st, tabs, mode, setMode, join }) {
  const memo = ctxMem.get();
  const [seat, setSeat] = useState(memo.room ?? null);
  const [view, setView] = useState(null);
  const [name, setName] = useState(() => memo.name || (account.profile?.registered ? account.name : "") || "");
  const [code, setCode] = useState(join ?? "");
  const [level, setLevel] = useState(memo.endless.level || 1);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [, tick] = useState(0);
  const clockOff = useRef(0);
  const lastSeen = useRef(0);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(t); }, []);
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
  function drop(text) { memo.room = null; ctxMem.save(); setSeat(null); setView(null); if (text) setErr(text); }
  const call = async (route, body = {}) => {
    setErr(null);
    try { return await roomCall(route, { code: seat.code, ...body }, seat.secret); }
    catch (e) { if (["ROOM", "AUTH"].includes(e.code)) drop(e.message); else setErr(e.message); }
  };
  async function enter(route) {
    const n = name.trim();
    if (!n) { setErr("Введи имя."); return; }
    if (route === "join" && !/^\d{6}$/.test(code.trim())) { setErr("Код — шесть цифр."); return; }
    setBusy(true); setErr(null);
    try {
      const d = await roomCall(route, route === "join" ? { name: n, code: code.trim() } : { name: n, level });
      memo.name = n; memo.room = { code: d.code, secret: d.secret, playerId: d.playerId }; ctxMem.save(); setSeat(memo.room);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }
  const invite = async () => {
    const url = `${location.origin}/#ctx=${seat.code}`;
    const text = `Сыграем в «Контекстно» в DERBYO? Комната ${seat.code}\n${url}`;
    try { if (navigator.share) { await navigator.share({ text }); return; } } catch (e) { if (e.name === "AbortError") return; }
    try { await navigator.clipboard.writeText(text); setErr("Ссылка скопирована"); } catch {}
  };
  const leave = async () => { setLeaving(false); await call("leave"); drop(); };

  const v = view, you = v?.you, host = v && v.host === you;
  const names = new Map((v?.players ?? []).map((p) => [p.id, p.name]));
  const sorted = (v?.guesses ?? []).slice().sort((a, b) => a.rank - b.rank);
  const used = new Set((v?.guesses ?? []).map((g) => g.id));
  const last = v?.guesses?.at(-1);
  const fresh = v && v.guesses.length > lastSeen.current ? last?.id : null;
  if (v) lastSeen.current = v.guesses.length;
  const hintLeft = v?.nextHintAt ? Math.max(0, Math.ceil((v.nextHintAt - (Date.now() + clockOff.current)) / 1000)) : null;
  const line = !seat ? "Один загаданный на всех, общий список вариантов. Кто первым назовёт №1 — выиграл раунд."
    : !v ? "Подключаемся…"
    : v.status === "playing" ? `Вариантов ${v.guesses.length}${hintLeft !== null ? ` · подсказка для всех через ${Math.floor(hintLeft / 60)}:${String(hintLeft % 60).padStart(2, "0")}` : v.hintsGiven ? " · подсказок больше не будет" : ""}`
    : `Комната ${seat.code.slice(0, 3)} ${seat.code.slice(3)} · игроков ${v.players.length} из 8`;
  return html`<div class="screen-with-bar daily-screen">
    <${GameTop} title="Контекстно" back=${nav.back} mode=${mode} setMode=${setMode} tabs=${tabs} line=${line} />
    <div class="screen-scroll"><div class="page game-page">
      ${!seat ? html`<div class="dg-empty glass ctx-lobby">
          <img src=${img("game-contexto")} alt="" /><b>Сыграйте вместе</b>
          <p>До 8 игроков. Подсказки открываются для всех сами: первая через 2 минуты, потом каждые полторы.</p>
          <label class="pw-field"><${Icon} name="profile" size="16" /><input value=${name} maxlength="16" onInput=${(e) => setName(e.target.value)} placeholder="Твоё имя" autocapitalize="words" /></label>
          <div class="dg-levels">${(st?.levels ?? []).map((l) => html`<button class=${cx("dg-level press", level === l.level && "on")} style=${`--t:${LEVEL_TINT[l.level]}`} onClick=${() => setLevel(l.level)}>
            <img src=${img(LEVEL_ICON[l.level])} alt="" /><b>${l.label}</b></button>`)}</div>
          <button class="primary-btn" disabled=${busy} onClick=${() => enter("create")}><img src=${img("invite")} alt="" />Создать комнату</button>
          <div class="ctx-join"><label class="pw-field"><input value=${code} inputmode="numeric" maxlength="6" onInput=${(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="Код из 6 цифр" /></label>
            <button class="navy-btn" disabled=${busy || code.length !== 6} onClick=${() => enter("join")}>Войти</button></div>
        </div>`
      : v ? html`
        <div class="ctx-players">${v.players.map((p) => html`<span class=${cx("ctx-player", p.id === you && "me", p.id === v.winner && "won")}>
            ${p.id === v.host ? html`<img src=${img("key")} alt="создатель" />` : null}<b>${p.id === you ? "ты" : p.name}</b>${p.best ? html`<small>#${p.best}</small>` : null}</span>`)}</div>
        ${v.status === "lobby" ? html`<div class="dg-empty glass"><img src=${img("invite")} alt="" /><b>${host ? "Позови друзей и начинай" : "Ждём, когда создатель начнёт"}</b>
            <p>Код комнаты <b class="ctx-code">${seat.code.slice(0, 3)} ${seat.code.slice(3)}</b> — друзья вводят его во вкладке «С друзьями» или открывают ссылку.</p></div>` : null}
        ${v.result ? html`<div class=${cx("dg-result glass", v.winner === you ? "won" : "lost")}>
            <small>${v.gaveUp ? "Раунд остановлен · загадан был" : v.winner === you ? "Ты угадал первым!" : `Первым угадал ${names.get(v.winner) ?? "кто-то"}`}</small>
            <div class="dg-answer"><${Face} p=${{ name: v.result.answer.name, photo: v.result.answer.photo }} size=${56} />
              <span><b>${v.result.answer.name}</b><em>${[v.result.answer.nat && `${v.result.answer.nat.flag} ${v.result.answer.nat.label}`, v.result.answer.pos, v.result.answer.born].filter(Boolean).join(" · ")}</em></span></div>
          </div>` : null}
        <div class="dg-list">${sorted.map((f) => html`<div class="ctx-by-wrap" key=${f.id}>
            <${CtxRow} f=${f} total=${v.total} hint=${f.hint} why=${v.result?.why?.[f.id]} fresh=${f.id === fresh} />
            ${f.by ? html`<span class=${cx("ctx-by", f.by === you && "me")}>${f.by === you ? "ты" : names.get(f.by) ?? "игрок"}</span>` : null}</div>`)}</div>`
      : null}
      ${err ? html`<p class="hint-line small pad" style="color:#FF9AA8">${err}</p>` : null}
    </div></div>
    <${BottomBar}>
      ${!seat || !v ? null : v.status === "playing" ? html`
        ${last ? html`<div class="ctx-last"><small>Последний вариант · ${last.by === you ? "твой" : last.by ? names.get(last.by) : "подсказка"}</small><${CtxRow} f=${last} total=${v.total} hint=${last.hint} /></div>` : null}
        <div class="dg-bar">
          <${AskButton} busy=${busy} text=${`Назови футболиста${sorted[0] ? ` · лучший #${sorted[0].rank}` : ""}`} open=${() => setAsking(true)} />
          ${host ? html`<button class="round-tool press" aria-label="Остановить раунд" onClick=${() => call("giveup")}><img src=${img("finish")} alt="" /></button>` : null}
          <button class="round-tool press" aria-label="Позвать в комнату" onClick=${invite}><img src=${img("share")} alt="" /></button>
        </div>`
      : html`<div class="dg-bar">
          ${host ? html`<button class="primary-btn" onClick=${() => call("start", { level: v.level })}><img src=${img("bolt")} alt="" />${v.round ? "Следующий раунд" : "Начать раунд"}</button>`
            : html`<span class="dg-wait">${v.round ? "Следующий раунд начнёт создатель" : "Ждём начала"}</span>`}
          <button class="round-tool press" aria-label="Позвать в комнату" onClick=${invite}><img src=${img("share")} alt="" /></button>
          <button class="round-tool press" aria-label="Выйти из комнаты" onClick=${() => setLeaving(true)}><img src=${img("logout")} alt="" /></button>
        </div>`}
    <//>
    ${asking && v?.status === "playing" ? html`<${Panel} onClose=${() => setAsking(false)} class="answer-panel">${(leaveSheet) => html`<${PickSheet}
        head=${html`<b>${sorted[0] ? `Лучший в комнате #${sorted[0].rank}` : "Первый вариант в комнате"}</b>`} placeholder="Фамилия футболиста…" empty="Начни вводить фамилию — выбери футболиста из списка."
        find=${(q) => ctxApi("search", { query: q }).then((r) => r.players ?? [])} row=${playerRow} used=${used}
        choose=${async (p) => { setBusy(true); await call("guess", { id: p.id }); vibrate(10); setBusy(false); }} dismiss=${leaveSheet} />`}<//>` : null}
    ${leaving ? html`<${Alert} title="Выйти из комнаты?" message="Вернуться можно по коду, если комната ещё открыта." onClose=${() => setLeaving(false)}
      actions=${[{ title: "Остаться", run: () => setLeaving(false) }, { title: "Выйти", kind: "destructive", run: leave }]} />` : null}
  </div>`;
}
