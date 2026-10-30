// «Контекстно» and «Что их связывает» in the app's look, like «Футболист дня» (daily.js): the site's /api/contexto and /api/links,
// the same localStorage keys as the site's pages (progress is shared), a fixed top with tabs and levels, cards that scroll,
// and the answer field at the bottom bar opening a sheet over the keyboard.
import { html, useState, useEffect, useRef, cx, img, Icon, BottomBar, LobbyHeader, Panel, vibrate, Alert } from "./common.js";
import { Face } from "./sheets.js";
import { raiseKeyboard } from "./match.js";

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

export function ContextoView({ nav, app }) {
  const memo = ctxMem.get();
  const [mode, setMode] = useState(() => (memo.appMode === "endless" ? "endless" : "daily"));
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
  useEffect(() => { if (st) open(); }, [st, mode]);

  const pickMode = (m) => {
    // «С друзьями» is a shared live room: for now it opens the site's own page inside the app.
    if (m === "friends") { nav.push("minigame", { game: { id: "contexto", path: "/contexto", hash: "#friends", title: "Контекстно · с друзьями" } }); return; }
    setMode(m);
  };
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
