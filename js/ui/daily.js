// «Футболист дня» in the app's own look: the site's /api/daily game (server/daily.mjs), played with the tic-tac-toe parts —
// the header and tabs, guesses as cards, the answer field at the bottom bar opening the answer sheet over the keyboard.
// Progress lives where the site's page keeps it (localStorage derbyo.daily.v1), so both continue the same game.
import { html, useState, useEffect, useRef, cx, img, Icon, BottomBar, LobbyHeader, Panel, vibrate } from "./common.js";
import { Face } from "./sheets.js";
import { raiseKeyboard } from "./match.js";
import { IntroCard, SoloTrays, useDailyReward, RewardChip } from "./games.js";

const STORE = "derbyo.daily.v1";
const load = () => { try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch { return {}; } };
let memory = null;
const mem = () => {
  if (!memory) {
    memory = Object.assign({ games: {}, played: 0, wins: 0, streak: 0, best: 0, lastWin: 0, lastPlayed: 0 }, load());
    memory.endless = Object.assign({ level: 1, round: null, seen: [], stats: {} }, memory.endless);
  }
  return memory;
};
const save = () => { try { localStorage.setItem(STORE, JSON.stringify(mem())); } catch {} };

async function api(route, body = {}) {
  const r = await fetch("/api/daily/" + route, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await r.json().catch(() => ({ ok: false, error: "Сервер недоступен. Попробуй ещё раз." }));
  if (!data.ok) throw Object.assign(new Error(data.error || "Ошибка."), { code: data.code });
  return data;
}

const LEVEL_ICON = { 1: "level-rookie", 2: "level-amateur", 3: "level-knower", 4: "level-legend" };
const LEVEL_TINT = { 1: "#C9D5E3", 2: "#6FA8FF", 3: "#FFE45C", 4: "#FF7A3D" };
const POS_SHORT = { G: "ВРТ", D: "ЗАЩ", M: "ПЗЩ", F: "НАП" };
const clock = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return [s / 3600, (s % 3600) / 60, s % 60].map((n) => String(Math.floor(n)).padStart(2, "0")).join(":"); };
const hintText = (h) => h.letters.map((n, i) => (i === h.letters.length - 1 ? h.first + "·".repeat(n - 1) : "·".repeat(n))).join(" ");

/** One guess: the player and four tiles — green matches, yellow is close, grey misses. */
function GuessCard({ f, n, fresh }) {
  const arrow = f.born.dir > 0 ? "↑" : f.born.dir < 0 ? "↓" : "";
  return html`<div class=${cx("dg-card glass", f.correct && "win", fresh && "fresh")}>
    <div class="dg-who"><${Face} p=${{ name: f.name, photo: f.photo }} size=${40} /><b>${f.name}</b><i>${n}</i></div>
    <div class="dg-tiles">
      <span class=${cx("dg-tile", f.nat.result)}><small>Сборная</small><em class="flag">${f.nat.flag}</em><span>${f.nat.label}</span></span>
      <span class=${cx("dg-tile", f.pos.result)}><small>Позиция</small><b>${POS_SHORT[f.pos.code] ?? "—"}</b><span>${f.pos.label}</span></span>
      <span class=${cx("dg-tile", f.born.result)}><small>Год</small><b>${f.born.year ?? "—"}${arrow ? html`<i>${arrow}</i>` : null}</b>
        <span>${f.born.result === "hit" ? "тот же" : arrow === "↑" ? "загаданный моложе" : arrow === "↓" ? "загаданный старше" : ""}</span></span>
      <span class=${cx("dg-tile clubs", f.clubs.result)}><small>Клубы</small>
        ${f.clubs.shared.length ? html`<span class="dg-clubs">${f.clubs.shared.slice(0, 3).map((c) => html`<span class="dg-club">${c.logo ? html`<img src=${c.logo} alt="" referrerpolicy="no-referrer" />` : null}<em>${c.name}</em></span>`)}</span>`
          : html`<span>${f.clubs.result === "near" ? "одна лига" : "нет общих"}</span>`}</span>
    </div>
  </div>`;
}

/** The answer sheet: what you typed finds players; a tap on one is the guess. The field sits on the keyboard, as in the match. */
function DailyAnswer({ game, attempts, hint, used, choose, dismiss }) {
  const [query, setQuery] = useState("");
  const [found, setFound] = useState([]);
  const field = useRef();
  useEffect(() => { field.current?.focus({ preventScroll: true }); }, []);
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setFound([]); return; }
    let live = true;
    const t = setTimeout(() => api("search", { query: q }).then((r) => live && setFound(r.players ?? [])).catch(() => {}), 180);
    return () => { live = false; clearTimeout(t); };
  }, [query]);
  const hits = found.slice(0, 6).reverse();
  // The closest match sits at the bottom, by the keyboard: the list opens scrolled down to it.
  const scroller = useRef();
  useEffect(() => { const el = scroller.current; if (el) el.scrollTop = el.scrollHeight; }, [found]);
  return html`<div class="answer">
    <div class="cond-bubble glass dg-ask">
      <span class="dg-dots">${Array.from({ length: game.max }, (_, i) => html`<i class=${cx(i < attempts && "used", i === attempts && "now")}></i>`)}</span>
      <b>Попытка ${attempts + 1} из ${game.max}</b>
      ${hint ? html`<small>Фамилия: ${hintText(hint)}</small>` : null}
    </div>
    <div class="answer-scroll" ref=${scroller}>
      ${query.trim().length < 2 ? html`<p class="hint-line">Начни вводить фамилию — выбери футболиста из списка.</p>`
        : !hits.length ? html`<p class="hint-line">Никого не нашли — проверь написание</p>`
        : html`<div class="hits">${hits.map((p) => html`<button class=${cx("hit", used.has(p.id) && "used")} disabled=${used.has(p.id)} onClick=${() => { choose(p); dismiss(); }}>
            <${Face} p=${{ name: p.name, photo: p.photo }} size=${40} /><span class="hit-name"><b>${p.name}</b><small>${used.has(p.id) ? "уже был" : p.birthYear ? `${p.birthYear} г. р.` : "год неизвестен"}</small></span><i>↵</i></button>`)}</div>`}
    </div>
    <form class="answer-row" action="#" onSubmit=${(e) => { e.preventDefault(); const p = hits.at(-1); if (p && !used.has(p.id)) { choose(p); dismiss(); } }}>
      <span class="field"><input ref=${field} value=${query} onInput=${(e) => setQuery(e.target.value)} placeholder="Фамилия футболиста…"
        autocapitalize="words" autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="send" />
        <button type="submit" class=${cx("send", hits.length && "on")} disabled=${!hits.length} aria-label="Ответить"><${Icon} name="up" size="17" weight="3" /></button></span>
    </form>
  </div>`;
}

export function DailyView({ nav }) {
  const [mode, setMode] = useState(() => mem().dailyMode ?? "daily");
  const [st, setSt] = useState(null);
  const [rows, setRows] = useState([]);
  const [game, setGame] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [, tick] = useState(0);
  const freshId = useRef(null);
  const list = useRef();
  const offset = useRef(0);

  // The day's clock ticks for the «new player in» line.
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(t); }, []);
  useEffect(() => { api("state").then((s) => { offset.current = s.serverNow - Date.now(); setSt(s); }).catch((e) => setErr(e.message)); }, []);
  useEffect(() => { if (st) open(mode); }, [st, mode]);
  // New guesses land at the top, by the field: keep them in view.
  useEffect(() => { const el = list.current?.closest(".screen-scroll"); if (el) el.scrollTop = 0; }, [rows.length, game?.over]);

  async function open(m) {
    setErr(null); setRows([]);
    const memo = mem();
    memo.dailyMode = m; save();
    let g;
    if (m === "daily") g = memo.games[st.day] ||= { guesses: [], hint: null, over: false };
    else {
      g = memo.endless.round;
      if (!g) {
        const d = await api("endless/start", { level: memo.endless.level, avoid: memo.endless.seen }).catch((e) => { setErr(e.message); return null; });
        if (!d) return;
        g = memo.endless.round = { token: d.token, level: d.level, guesses: [], hint: null, over: false };
        save();
      }
    }
    setGame({ ...g, mode: m, max: st.maxGuesses });
    if (!g.guesses.length) return;
    try {
      const d = await api(m === "daily" ? "restore" : "endless/restore", m === "daily" ? { day: st.day, guesses: g.guesses } : { token: g.token, guesses: g.guesses });
      setRows(d.feedback);
      if (d.over) { Object.assign(g, { over: true, won: d.won, answer: d.answer, stats: d.stats ?? g.stats }); save(); setGame({ ...g, mode: m, max: st.maxGuesses }); }
    } catch (e) {
      if (e.code === "ROUND") { memo.endless.round = null; save(); open(m); return; }
      setErr(e.message);
    }
  }

  const ref = () => (mode === "daily" ? mem().games[st.day] : mem().endless.round);
  async function choose(p) {
    const g = ref();
    if (busy || !g || g.over || g.guesses.includes(p.id)) return;
    setBusy(true); setErr(null);
    try {
      const guesses = [...g.guesses, p.id];
      const d = await api(mode === "daily" ? "guess" : "endless/guess", mode === "daily" ? { day: st.day, guesses } : { token: g.token, guesses });
      g.guesses = guesses;
      freshId.current = d.feedback.id;
      setRows((r) => [...r, d.feedback]);
      vibrate(d.feedback.correct ? [20, 40, 20] : 10);
      if (d.over) await finish(g, d);
      save();
      setGame({ ...g, mode, max: st.maxGuesses });
    } catch (e) {
      if (e.code === "DAY") { setSt(null); api("state").then(setSt); }
      if (e.code === "ROUND") { mem().endless.round = null; save(); open(mode); }
      setErr(e.message);
    }
    setBusy(false);
  }
  async function finish(g, d) {
    const memo = mem();
    g.over = true; g.won = d.won; g.answer = d.answer;
    if (mode === "endless") {
      const s = (memo.endless.stats[g.level] ||= { played: 0, wins: 0, streak: 0, best: 0 });
      s.played++;
      if (d.won) { s.wins++; s.streak++; s.best = Math.max(s.best, s.streak); } else s.streak = 0;
      memo.endless.seen = [...memo.endless.seen, d.answer.id].slice(-200);
      return;
    }
    if (memo.lastPlayed !== st.day) {
      memo.played++;
      if (d.won) { memo.wins++; memo.streak = memo.lastWin === st.day - 1 ? memo.streak + 1 : 1; memo.best = Math.max(memo.best, memo.streak); memo.lastWin = st.day; }
      else memo.streak = 0;
      memo.lastPlayed = st.day;
    }
    try { g.stats = (await api("finish", { day: st.day, guesses: g.guesses, hint: !!g.hint })).stats; } catch {}
  }
  async function takeHint() {
    const g = ref();
    try {
      const d = await api(mode === "daily" ? "hint" : "endless/hint", mode === "daily" ? { day: st.day, guesses: g.guesses } : { token: g.token, guesses: g.guesses });
      g.hint = d.hint; save(); setGame({ ...g, mode, max: st.maxGuesses });
    } catch (e) { setErr(e.message); }
  }
  async function nextRound(level = mem().endless.level) {
    const memo = mem(), g = memo.endless.round;
    // Leaving a started round for another level counts as a miss on its level.
    if (g && !g.over && g.guesses.length) { const s = (memo.endless.stats[g.level] ||= { played: 0, wins: 0, streak: 0, best: 0 }); s.played++; s.streak = 0; }
    memo.endless.level = level; memo.endless.round = null; save();
    open("endless");
  }


  const used = new Set(game?.guesses ?? []);
  const attempts = game?.guesses.length ?? 0;
  const level = mem().endless.level;
  const lstats = mem().endless.stats[level] || { played: 0, wins: 0, streak: 0, best: 0 };
  const memo = mem();
  const reward = useDailyReward(mode === "daily" && game?.won && st ? { game: "daily", day: st.day, guesses: game.guesses } : null);
  return html`<div class="screen-with-bar daily-screen"><div class="game-top">
    <${LobbyHeader} title="Футболист дня" back=${nav.back} />
    <div class="segmented talk-tabs dg-tabs" role="tablist">
      ${[["daily", "Сегодня"], ["endless", "Бесконечный"]].map(([m, t]) => html`<button role="tab" aria-selected=${mode === m} class=${cx("press", mode === m && "on")} onClick=${() => mode !== m && setMode(m)}>${t}</button>`)}
    </div>
    ${mode === "endless" && st ? html`<div class="dg-levels">${st.levels.map((l) => html`<button class=${cx("dg-level press", level === l.level && "on")} style=${`--t:${LEVEL_TINT[l.level]}`}
        onClick=${() => level !== l.level && nextRound(l.level)}><img src=${img(LEVEL_ICON[l.level])} alt="" /><b>${l.label}</b></button>`)}</div>
      <p class="dg-line">Серия ${lstats.streak} · рекорд ${lstats.best} · угадано ${lstats.wins} из ${lstats.played}</p>`
    : st ? html`<p class="dg-line">Один футболист на всех · новый через ${clock(st.nextAt - (Date.now() + offset.current))}</p>` : null}
    ${game && !game.over ? html`<button class="dg-ask-btn press" disabled=${busy} onClick=${() => { raiseKeyboard(); setAsking(true); }}>
        <${Icon} name="search" size="17" /><span>${busy ? "Проверяем…" : `Назови футболиста · ${attempts + 1} из ${st.maxGuesses}`}</span></button>
      ${game.hint ? html`<p class="dg-hint">Фамилия: <b>${hintText(game.hint)}</b></p>` : null}` : null}
  </div><div class="screen-scroll"><div class="page game-page">
    ${!st && !err ? html`<p class="hint-line pad">Загружаем…</p>` : null}
    ${st && game && !rows.length && !game.over ? html`<${IntroCard} icon="game-daily" title="Кто этот футболист?" sub=${`${st.maxGuesses} попыток`}
        steps=${["Назови любого футболиста", html`Сравни: <i class="k-hit">точно</i> <i class="k-near">близко</i> <i class="k-miss">мимо</i>`, "Сборная, позиция, год и клубы подскажут путь"]} />` : null}
    ${game?.over && game.answer ? html`<div class=${cx("dg-final glass", game.won ? "won" : "lost")}>
        <small class="dgf-cap">${game.won ? `Угадано за ${attempts} из ${st.maxGuesses}${game.hint ? " · с подсказкой" : ""}` : "Не угадано · это был"}</small>
        <div class="dgf-face">${game.answer.photo ? html`<img src=${game.answer.photo} alt="" referrerpolicy="no-referrer" onError=${(e) => (e.target.style.display = "none")} />` : null}
          <b>${game.answer.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}</b>${game.won ? html`<i class="dgf-badge">✓</i>` : null}</div>
        <b class="dgf-name">${game.answer.name}</b>
        <span class="dgf-meta">${[game.answer.nat && `${game.answer.nat.flag ?? ""} ${game.answer.nat.label ?? ""}`.trim(), game.answer.pos, game.answer.born && `${game.answer.born} г. р.`].filter(Boolean).join(" · ")}</span>
        <${RewardChip} r=${reward} />
        ${game.answer.career?.length ? html`<div class="ctx-career dgf-career">${game.answer.career.slice(-6).map((c) => html`<span>${c.logo ? html`<img src=${c.logo} alt="" referrerpolicy="no-referrer" />` : null}<b>${c.name}</b><small>${String(c.years).split(",")[0]}</small></span>`)}
          ${game.answer.career.length > 6 ? html`<span class="more">ещё ${game.answer.career.length - 6}</span>` : null}</div>` : null}
        ${mode === "daily" ? html`<div class="pf-stats dgf-stats"><span><b>${memo.played}</b><small>Сыграно</small></span><span><b>${memo.played ? Math.round((memo.wins / memo.played) * 100) : 0}%</b><small>Побед</small></span><span><b>${memo.streak}</b><small>Серия</small></span></div>` : null}
      </div>` : null}
    <div class="dg-list" ref=${list}>${rows.map((f, i) => html`<${GuessCard} f=${f} n=${i + 1} fresh=${f.id === freshId.current} key=${f.id} />`).reverse()}</div>
    ${err ? html`<p class="hint-line small pad" style="color:#FF9AA8">${err}</p>` : null}
  </div></div>
  <${BottomBar}>
    ${!game ? null : html`<${SoloTrays} menu=${() => setMenuOpen(true)} left=${!game.over ? html`<div class="tray turn-tray glass solo-count">
        <span class="tray-label"><b>Попытка ${attempts + 1} из ${st.maxGuesses}</b><small>${game.hint ? "подсказка взята" : attempts >= st.hintAfter ? "подсказка доступна в меню" : `подсказка после ${st.hintAfter} попыток`}</small></span></div>`
      : html`<div class="tray turn-tray glass over">${mode === "daily" ? html`<button class="primary-btn ctx-next" onClick=${() => setMode("endless")}><img src=${img("bolt")} alt="" />Играть бесконечный</button>`
        : html`<button class="primary-btn ctx-next" onClick=${() => nextRound()}><img src=${img("bolt")} alt="" />Следующий игрок</button>`}</div>`} />`}
  <//>
  ${menuOpen ? html`<${Panel} onClose=${() => setMenuOpen(false)}><div class="menu">
      <h2>Футболист дня</h2>
      ${game && !game.over ? html`<button class="navy-btn menu-row" disabled=${!!game.hint || attempts < st.hintAfter} onClick=${() => { setMenuOpen(false); takeHint(); }}>
          ${game.hint ? `Подсказка: ${hintText(game.hint)}` : attempts < st.hintAfter ? `Подсказка — после ${st.hintAfter} попыток` : "Взять подсказку: первая буква фамилии"}</button>`
        : mode === "daily" ? html`<button class="navy-btn menu-row" onClick=${() => { setMenuOpen(false); setMode("endless"); }}>Играть бесконечный</button>`
        : html`<button class="navy-btn menu-row" onClick=${() => { setMenuOpen(false); nextRound(); }}>Следующий игрок</button>`}
    </div><//>` : null}
  ${asking && game && !game.over ? html`<${Panel} onClose=${() => setAsking(false)} class="answer-panel">${(leave) => html`<${DailyAnswer} game=${game} attempts=${attempts} hint=${game.hint}
      used=${used} choose=${choose} dismiss=${leave} />`}<//>` : null}
  </div>`;
}
