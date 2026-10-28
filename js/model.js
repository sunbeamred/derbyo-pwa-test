// Local stand-in for the server's match (port of MatchModel.swift): turn clock, answers, tokens, score.
// In the real app all of this comes from the server's match stream.
import { has, byId, players, columns, rows, fits, rowFits, miss, nations, clubNames, positions, shuffle, pick, rand, sleep } from "./data.js";

let listeners = new Set();
/** Any state change redraws the screen. */
export const store = { on: (f) => (listeners.add(f), () => listeners.delete(f)), changed: () => listeners.forEach((f) => f()) };

export const Opponent = {
  /** A human opponent with test profile data (country, rating, place) until the app talks to the server. */
  human(name = "tima_kz") {
    return has("demoTop") ? { name, isBot: false, flag: "🇺🇿", rating: 2655, rank: 1 } : { name, isBot: false, flag: "🇺🇿", rating: 1185, rank: 1240 };
  },
  /** The practice bot: "Бот" and an English first name, so it reads as a bot at a glance (AGENTS.md). */
  bot() {
    return { name: "Бот " + pick(["Oliver", "Harry", "Jack", "George", "Charlie", "Alfie", "Freddie", "Archie", "Leo", "Theo", "Oscar", "Henry"]), isBot: true, flag: null, rating: 1200, rank: null };
  },
};

export const Hints = {
  profile: { id: "profile", cost: 1, title: "Профиль" },
  letters: { id: "letters", cost: 2, title: "Буквы" },
  four: { id: "four", cost: 4, title: "4 имени" },
};

/** What the scout has opened on one cell; every hint on a cell points at the same hidden answer. */
export function clueFacts(clue) {
  const out = [], conds = clue.conditions, a = clue.answer;
  if (!conds.some((c) => c.icon.kind === "flag") && nations[a.nation]) out.push({ label: "Страна", text: nations[a.nation][0], flag: nations[a.nation][1] });
  if (!conds.some((c) => c.key.startsWith("p"))) out.push({ label: "Позиция", text: positions[a.position] ?? "" });
  if (conds.some((c) => c.icon.kind !== "crest")) {
    const club = [...a.clubs].sort().find((c) => !conds.some((x) => x.key === c));
    if (club && clubNames[club]) out.push({ label: "Ещё один клуб", text: clubNames[club] });
  }
  return out;
}
export const clueMask = (clue) => clue.answer.name.split(" ").map((w) => [...w][0] + "•".repeat(Math.max(0, [...w].length - 1)));

export const LEVELS = ["Новичок", "Любитель", "Знаток", "Легенда", "Энциклопедия"];
export const MAX_VIEWERS = 24;
const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
const demoIdle = has("demoOppIdle");
let uid = 0;
const id = () => ++uid;

export class Match {
  static pauseAskTimeout = 15;
  static resumeTimeout = demoIdle ? 8 : 30;
  static nextTimeout = demoIdle ? 12 : 60;
  static rematchTimeout = demoIdle ? 8 : 30;

  constructor(opponent, watching = has("demoWatch")) {
    this.opponent = opponent;
    this.watching = watching;
    this.cells = Array(9).fill(null);
    this.seconds = 60; this.turnLength = 60; this.score = [0, 0]; this.round = 1; this.tokens = 4; this.oppTokens = 4;
    this.code = `${Math.floor(rand(100, 1000))} ${String(Math.floor(rand(0, 1000))).padStart(3, "0")}`;
    this.startLevel = 1; this.levelBoost = 0; this.raiseAnswered = false;
    this.myName = "damir_andromeda"; this.myFlag = "🇰🇿";
    this.viewers = []; this.relation = "none"; this.viewerRelations = {};
    this.roundResults = []; this.selected = null; this.paused = false; this.awaySeconds = 45;
    this.oppAwayBudget = 45; this.oppAwayFor = null; this.oppSelected = null; this.sharedClues = {};
    this.review = null; this.mismatch = null; this.oppMissed = 0; this.roundOver = false; this.roundWinner = null;
    this.toast = null; this.unread = 1; this.oppReaction = null; this.myReaction = null; this.landed = null; this.recent = null;
    this.finishSignal = 0; this.finishedAt = 0; this.missSignal = 0; this.timerAlert = 0; this.reward = null;
    this.streak = 0; this.hintThisTurn = false; this.nextBonus = 0; this.used = new Set(); this.moveToken = 0;
    this.pauseAskLeft = null; this.oppPauseAskLeft = null; this.resumeWait = null;
    this.oppLeft = false; this.rematchAsked = false; this.nextAsked = false; this.readyLeft = 0; this.readyTotal = 60;
    this.alive = true;
    this.rows = rows; this.cols = columns;
    // Demos keep you on the cross unless asked otherwise; a real match draws the seat.
    this.mySeat = has("demoSeatO") ? 1 : [...new URLSearchParams(location.search).keys()].some((k) => k.startsWith("demo")) ? 0 : Math.round(Math.random());
    this.turn = this.mySeat === 0 ? 0 : 1;
    this.chat = [{ id: id(), who: opponent.name, text: opponent.isBot ? "Привет! Я учебный бот." : "Привет, удачи 🤝", kind: "text", spectator: false }];
    if (has("demoViewers") || watching) {
      this.viewers = ["alex_99", "nurik", ...(watching ? [this.myName] : [])];
      this.chat.push({ id: id(), who: "alex_99", text: "Давай, Тима! ⚽", kind: "text", spectator: true });
      this.later(4, () => { this.viewers.push("sasha.fc"); this.show("На трибуне: sasha.fc", true); });
    }
    if (has("demoBoard") && columns[0].key === "barca" && columns[1].key === "real") this.fillDemo();
    if (has("demoMatchPoint")) { this.round = 2; this.score = [1, 0]; this.roundResults = [0]; }
    if (has("demoWin")) { this.fillDemo(); for (const [i, pid] of [[6, "griezmann"], [8, "henry"]]) this.put(i, 0, pid); this.checkEnd(); }
    if (has("demoAway")) this.awaySeconds = 27;
    if (has("demoRich")) this.tokens = 99;
    if (has("demoMix")) for (const [i, o, pid] of [[0, 0, "benzema"], [4, 1, "iniesta"], [8, 0, "rakitic"]]) this.put(i, o, pid);
    if (has("demoLongMatch")) { this.round = 9; this.score = [1, 1]; this.roundResults = [0, null, 1, null, null, null, null, null]; this.later(4, () => this.endRound(null)); }
    if (this.turn === 1 || watching) this.opponentMove();
    if (has("demoOppAway")) { this.later(3, () => this.opponentLeft()); this.later(15, () => this.opponentBack()); }
    if (has("demoLoseLater")) { this.fillDemo(); this.later(4, () => { this.put(6, 1, "griezmann"); this.checkEnd(); }); }
    if (has("demoOppPause")) this.later(4, () => { if (this.paused) return; this.oppPauseAskLeft = Match.pauseAskTimeout; this.show(`${this.opponent.name} просит паузу`, true); });
    if (has("demoFriendAsk")) this.later(3, () => {
      if (this.relation !== "none") return;
      this.relation = "incoming";
      this.chat.push({ id: id(), who: this.opponent.name, text: "", kind: "friendIn", spectator: false });
      this.unread++;
      this.show(`${this.opponent.name} хочет добавить тебя в друзья`, true);
    });
    if (has("demoOppReview")) {
      this.fillDemo(); this.turn = 1; this.oppSelected = 5;
      this.later(2.2, () => { this.moveToken = id(); this.oppSelected = null; const pl = byId.ronaldinho; this.review = { owner: 1, cell: 5, playerId: pl.id, why: miss(columns[2], pl.name), left: 20 }; });
    }
    if (has("demoLastMove")) { this.fillDemo(); this.put(6, 0, "griezmann"); }
    if (has("demoWinLater")) { this.fillDemo(); this.later(4, () => { for (const [i, pid] of [[6, "griezmann"], [8, "henry"]]) this.put(i, 0, pid); this.checkEnd(); }); }
  }

  /** Runs `f` after `s` seconds unless the match screen has been closed, then redraws. */
  later(s, f) { setTimeout(() => { if (this.alive) { f(); store.changed(); } }, s * 1000); }
  put(i, owner, pid) { this.cells[i] = { owner, playerId: pid, winning: false }; this.used.add(pid); }
  fillDemo() { for (const [i, o, pid] of [[0, 0, "rakitic"], [4, 1, "marcelo"], [7, 0, "benzema"], [2, 1, "mandzukic"]]) this.put(i, o, pid); }

  get hasBoard() { return true; }
  get leftName() { return this.watching ? "aruzhan_7" : this.myName; }
  name(owner) { return owner === 0 ? this.leftName : this.opponent.name; }
  get myRating() { return this.watching ? 1510 : has("demoLegend") ? 2310 : 1420; }
  get myRank() { return this.watching ? 208 : has("demoLegend") ? 4 : 312; }
  seat(owner) { return owner === 0 ? this.mySeat : 1 - this.mySeat; }
  mark(owner) { return this.seat(owner) === 0 ? "mark-x" : "mark-o"; }
  opener(n) { return (n - 1) % 2 === this.mySeat ? 0 : 1; }

  /** As on the site: one level up per round up to Легенда (Энциклопедия only by preset), plus agreed raises. */
  levelIndex(n) { return Math.min(LEVELS.length - 1, Math.min(3, this.startLevel + n - 1) + this.levelBoost); }
  get level() { return LEVELS[this.levelIndex(this.round)]; }
  get nextLevel() { return LEVELS[this.levelIndex(this.round + 1)]; }
  /** Three levels around the current one for the header: the one before (from round 2), the current, the next. */
  get levelPath() {
    const i = this.levelIndex(this.round), last = LEVELS.length - 1;
    const from = Math.max(0, Math.min(last - 2, this.round === 1 ? i : i - 1));
    const out = [];
    for (let k = from; k <= Math.min(last, from + 2); k++) out.push({ name: LEVELS[k], current: k === i });
    return out;
  }
  get offerRaise() {
    return this.roundOver && this.roundWinner === null && !this.matchOver && !this.raiseAnswered && this.round >= 3
      && this.levelIndex(this.round + 1) < LEVELS.length - 1 && this.levelIndex(this.round + 1) === this.levelIndex(this.round);
  }
  get raisedLevel() { return LEVELS[Math.min(LEVELS.length - 1, this.levelIndex(this.round) + 1)]; }
  raiseLevel(yes) {
    this.raiseAnswered = true;
    if (!yes) return;
    this.levelBoost++;
    this.show(`${this.opponent.name} согласен · следующий раунд — «${LEVELS[this.levelIndex(this.round + 1)]}»`, true);
  }

  get matchOver() { return this.score[0] === 2 || this.score[1] === 2; }

  // Profiles and friends (test data; here they only change what is shown).
  profile(owner) {
    if (owner === 0) return { name: this.leftName, flag: this.myFlag, rating: this.myRating, rank: this.myRank, level: this.myRating > 2200 ? 63 : 27, games: 128, winRate: 61, bestStreak: 7 };
    if (this.opponent.isBot) return { name: this.opponent.name, flag: null, rating: this.opponent.rating, rank: null, level: null, games: 0, winRate: 0, bestStreak: 0 };
    return { name: this.opponent.name, flag: this.opponent.flag, rating: this.opponent.rating, rank: this.opponent.rank, level: 12, games: 74, winRate: 54, bestStreak: 5 };
  }
  viewerProfile(v) {
    if (v === this.myName && this.watching) return { name: v, flag: "🇰🇿", rating: 1420, rank: 312, level: 27, games: 128, winRate: 61, bestStreak: 7 };
    let h = 7;
    for (const ch of v) h = (h * 31 + ch.codePointAt(0)) & 0xffff;
    const flags = ["🇰🇿", "🇺🇿", "🇷🇺", "🇰🇬", "🇦🇿", "🇧🇾"];
    return { name: v, flag: flags[h % flags.length], rating: 900 + (h % 900), rank: 300 + (h % 4000), level: 2 + (h % 30), games: 10 + (h % 200), winRate: 35 + (h % 30), bestStreak: 1 + (h % 9) };
  }
  get headToHead() { return this.opponent.isBot ? null : { w: 3, l: 2, d: 1 }; }
  relationWith(v) { return v ? this.viewerRelations[v] ?? "none" : this.relation; }
  sendFriendRequest(v = null) {
    if (this.relationWith(v) !== "none") return;
    if (v) { this.viewerRelations[v] = "outgoing"; this.show(`Заявка отправлена: ${v}`, true); return; }
    this.relation = "outgoing";
    this.chat.push({ id: id(), who: "Ты", text: "", kind: "friendOut", spectator: false });
    this.show("Заявка отправлена", true);
  }
  acceptFriend(v = null) {
    if (this.relationWith(v) !== "incoming") return;
    if (v) this.viewerRelations[v] = "friends"; else this.relation = "friends";
    this.show("Вы теперь друзья", true);
  }
  block(v = null) {
    if (v) this.viewerRelations[v] = "blocked"; else this.relation = "blocked";
    this.show(`${v ?? this.opponent.name} заблокирован · чат скрыт`, false);
  }
  isBlocked(who) { return who === this.opponent.name ? this.relation === "blocked" : this.viewerRelations[who] === "blocked"; }
  report() { this.show("Жалоба отправлена", true); }

  markRecent(i) {
    this.landed = { i, n: id() }; this.recent = i;
    setTimeout(() => { if (this.recent === i) { this.recent = null; store.changed(); } }, 2500);
  }
  correct(i) { return players.filter((x) => fits(x, i) && !this.used.has(x.id)); }

  // Clock: called once a second while the match screen is up.
  tick() {
    this.tickReady();
    this.tickPause();
    if (this.roundOver || this.paused) return;
    if (this.oppAwayFor !== null) {
      this.oppAwayFor++;
      this.oppAwayBudget = Math.max(0, this.oppAwayBudget - 1);
      if (this.oppAwayBudget === 0) {
        this.oppAwayFor = null;
        this.show(`У ${this.opponent.name} вышло время вне игры — раунд твой`, true);
        this.endRound(0); return;
      }
    }
    if (this.review) {
      this.review = { ...this.review, left: this.review.left - 1 };
      if (this.review.left <= 0) this.settleReview(false, true);
      return;
    }
    this.seconds--;
    if (this.turn === 0 && !this.watching && (this.seconds === 15 || this.seconds === 5)) {
      this.show(this.seconds === 15 ? "Осталось 15 секунд на ход" : "5 секунд — последний шанс ответить", false);
      this.timerAlert++;
    }
    if (this.seconds <= 0) {
      this.missSignal++;
      if (this.turn === 1 && !this.watching) this.oppMissed++;
      this.show(this.turn === 0 && !this.watching ? "Время вышло — ход переходит"
        : this.oppMissed >= 2 && this.turn === 1 ? `${this.name(this.turn)} не отвечает · ход твой` : `${this.name(this.turn)} не успел`, false);
      this.selected = null;
      this.passTurn();
    }
  }

  select(i) {
    if (this.turn !== 0 || this.watching || this.roundOver || this.paused || this.review || this.mismatch || this.cells[i]) return;
    this.selected = i;
  }

  /** Returns "captured" | "mismatch" | "used" | "none". */
  answer(pl) {
    const i = this.selected;
    if (i === null || this.mismatch) return "none";
    if (this.used.has(pl.id)) return "used";
    if (fits(pl, i)) {
      this.selected = null;
      this.put(i, 0, pl.id);
      this.markRecent(i);
      // Fast is measured from the turn's own start, bonus seconds included.
      const fast = !this.hintThisTurn && this.turnLength - this.seconds <= 5;
      this.streak = this.hintThisTurn ? 0 : this.streak + 1;
      const bonus = this.streak >= 2;
      if (bonus) { this.tokens++; this.streak = 0; }
      if (fast) this.nextBonus = 10;
      if (fast || bonus) this.reward = { id: id(), title: bonus ? "+1 жетон" : "Быстрый ответ!", detail: fast ? "+10 секунд на следующий ход" : "Два самостоятельных ответа подряд", coins: bonus, fast, cell: i };
      // A capture that ends the round needs no toast: the result bubble says it.
      if (this.checkEnd()) return "captured";
      if (!(fast || bonus)) this.show(`${pl.name} — клетка твоя`, true);
      this.passTurn();
      return "captured";
    }
    const why = !rowFits(pl, i) ? miss(rows[Math.floor(i / 3)], pl.name) : miss(columns[i % 3], pl.name);
    this.streak = 0;
    // The field waits on the choice: ask for a decision, or cancel and name someone else. The clock runs.
    this.mismatch = { cell: i, playerId: pl.id, why };
    return "mismatch";
  }
  cancelMismatch() { this.mismatch = null; }

  buy(hint, i) {
    if (this.tokens < hint.cost || !this.openHint(hint, i)) return false;
    this.tokens -= hint.cost;
    this.hintThisTurn = true;
    return true;
  }
  openHint(hint, i) {
    if (!this.sharedClues[i]) {
      const c = this.correct(i);
      if (!c.length) return false;
      this.sharedClues[i] = { answer: pick(c), conditions: [rows[Math.floor(i / 3)], columns[i % 3]], open: [], options: null };
    }
    const c = this.sharedClues[i];
    if (c.open.includes(hint.id)) return false;
    c.open.push(hint.id);
    if (hint.id === "four") {
      const others = shuffle(players.filter((x) => x.id !== c.answer.id && !fits(x, i))).slice(0, 3);
      c.options = shuffle([c.answer, ...others]);
    }
    return true;
  }

  // Disputed answers.
  requestReview() {
    const m = this.mismatch;
    if (!m || this.turn !== 0 || this.roundOver || this.review) return;
    this.mismatch = null; this.selected = null;
    this.review = { owner: 0, cell: m.cell, playerId: m.playerId, why: m.why, left: 20 };
    const token = id(); this.moveToken = token;
    // The bot cannot check a name the base lacks, so it decides on a hunch after a few seconds.
    this.later(has("demoMismatch") ? 12 : rand(2.5, 5), () => {
      if (this.moveToken !== token || this.review?.owner !== 0) return;
      this.settleReview(has("demoReviewYes") || Math.random() < 0.5);
    });
  }
  decideReview(accept) { if (this.review?.owner === 1) this.settleReview(accept); }
  settleReview(accept, silent = false) {
    const r = this.review;
    if (!r) return;
    this.review = null;
    const judge = r.owner === 0 ? this.opponent.name : "Ты", nm = byId[r.playerId].name;
    if (accept) {
      this.put(r.cell, r.owner, r.playerId);
      this.markRecent(r.cell);
      if (this.checkEnd()) return;
      this.show(r.owner === 0 ? `${judge} засчитал ${nm}` : `Засчитано: ${nm}`, r.owner === 0);
    } else {
      this.missSignal++;
      this.show(silent ? "Нет решения · ход переходит" : r.owner === 0 ? `${judge} не засчитал ${nm}` : "Не засчитано · твой ход", r.owner === 1);
    }
    this.passTurn();
  }

  passOnPurpose() { if (this.turn !== 0 || this.roundOver) return; this.show("Ход передан сопернику", false); this.passTurn(); }
  surrender() { this.endRound(1); }

  // Pause, as on the site: asked by one, agreed by the other within 15 s; resumed when both agree.
  requestPause() {
    if (this.paused || this.roundOver || this.watching || this.pauseAskLeft !== null || this.canLeaveFree) return;
    if (this.oppPauseAskLeft !== null) { this.acceptPause(); return; }
    if (this.opponent.isBot) { this.startPause(); return; }
    this.pauseAskLeft = Match.pauseAskTimeout;
    this.show(`Пауза предложена · ждём ${this.opponent.name}`, true);
    if (demoIdle) return;
    this.later(1.5, () => { if (this.pauseAskLeft === null) return; this.show(`${this.opponent.name} согласился на паузу`, true); this.startPause(); });
  }
  acceptPause() { if (this.oppPauseAskLeft !== null) this.startPause(); }
  startPause() { this.pauseAskLeft = null; this.oppPauseAskLeft = null; this.resumeWait = null; this.paused = true; }
  requestResume() {
    if (!this.paused || this.resumeWait !== null) return;
    if (this.opponent.isBot) { this.endPause(); return; }
    this.resumeWait = 0;
    if (demoIdle) return;
    this.later(1.5, () => { if (this.paused && this.resumeWait !== null) this.endPause(); });
  }
  endPause() { this.paused = false; this.resumeWait = null; this.show("Матч продолжен по согласию обоих", true); }
  tickPause() {
    const left = this.pauseAskLeft;
    if (left !== null) { this.pauseAskLeft = left > 1 ? left - 1 : null; if (left <= 1) this.show(`${this.opponent.name} не ответил — пауза не началась`, false); }
    if (this.oppPauseAskLeft !== null) this.oppPauseAskLeft = this.oppPauseAskLeft > 1 ? this.oppPauseAskLeft - 1 : null;
    if (this.paused && this.resumeWait !== null) this.resumeWait++;
  }

  react(e) { this.chat.push({ id: id(), who: "Ты", text: e, kind: "text", spectator: this.watching }); this.myReaction = { e, n: id() }; }
  send(text) {
    this.chat.push({ id: id(), who: "Ты", text, kind: "text", spectator: this.watching });
    this.later(1.5, () => { this.chat.push({ id: id(), who: this.opponent.name, text: "👍", kind: "text", spectator: false }); this.unread++; });
  }

  /** Time away: the site's rule spends a match budget while the game is hidden. */
  cameBack(s) {
    if (this.roundOver || s <= 0) return;
    this.awaySeconds = Math.max(0, this.awaySeconds - s);
    this.show(this.awaySeconds > 0 ? `Ты был вне игры ${s} с · осталось ${this.awaySeconds} с` : "Время вне игры исчерпано", false);
  }
  opponentLeft() { if (this.oppAwayFor !== null || this.opponent.isBot || this.roundOver) return; this.oppAwayFor = 0; this.show(`${this.opponent.name} вышел из игры`, false); }
  opponentBack() { const g = this.oppAwayFor; if (g === null) return; this.oppAwayFor = null; this.show(`${this.opponent.name} вернулся · был вне игры ${g} с`, true); }

  passTurn() {
    this.oppSelected = null; this.mismatch = null;
    this.turn = 1 - this.turn;
    this.seconds = this.turn === 1 && demoIdle ? 8 : 60;
    if (this.turn === 0) { this.seconds += this.nextBonus; this.nextBonus = 0; this.hintThisTurn = false; }
    this.turnLength = this.seconds;
    if (this.turn === 1 || this.watching) this.opponentMove();
  }

  /** The side whose turn it is plays by itself: the opponent, or — when you watch — either player. */
  async opponentMove() {
    const who = this.turn, token = id();
    this.moveToken = token;
    const live = () => this.alive && this.moveToken === token && !this.roundOver && this.turn === who;
    await sleep(rand(1, 1.8));
    if (!live()) return;
    if (this.paused || this.oppAwayFor !== null) { this.opponentMove(); return; }
    // `demoOppIdle`: the opponent's screen is open but nobody is there; their clock just runs out.
    if (who === 1 && demoIdle) return;
    if (who === 1) this.oppMissed = 0;
    const free = [...Array(9).keys()].filter((i) => !this.cells[i] && this.correct(i).length);
    const target = this.completing(who, free) ?? this.completing(1 - who, free) ?? (free.includes(4) ? 4 : free.length ? pick(free) : null);
    // As on the site, the opponent's pick shows on the board while they think it over.
    this.oppSelected = target; store.changed();
    await sleep(rand(1.4, 2.2));
    if (!live()) return;
    const purse = who === 1 ? this.oppTokens : this.tokens;
    if (target !== null && !this.sharedClues[target] && purse >= 1 && Math.random() < (has("demoOppHint") ? 1 : 0.3)) {
      const hint = purse >= 2 && Math.random() < 0.5 ? Hints.letters : Hints.profile;
      if (this.openHint(hint, target)) {
        if (who === 1) this.oppTokens -= hint.cost; else this.tokens -= hint.cost;
        this.show(`${this.name(who)} взял подсказку «${hint.title}» · ${hint.cost} жет.`, false); store.changed();
        await sleep(2);
        if (!live()) return;
      }
    }
    this.oppSelected = null;
    const missChance = has("demoOppHint") ? 1 : 0.18;
    const c = target !== null ? this.correct(target) : [];
    if (target === null || Math.random() <= missChance || !c.length) {
      this.missSignal++;
      this.show(this.watching ? `${this.name(who)} не угадал` : `${this.opponent.name} не угадал — твой ход`, !this.watching);
      this.passTurn(); store.changed(); return;
    }
    const pl = pick(c);
    this.put(target, who, pl.id);
    this.markRecent(target);
    if (who === 1 && Math.random() < 0.3) this.oppReaction = { e: pick(["🔥", "😎", "⚽"]), n: id() };
    if (this.checkEnd()) { store.changed(); return; }
    this.show(`${this.name(who)}: ${pl.name}`, false);
    this.passTurn(); store.changed();
  }

  completing(who, free) {
    return free.find((i) => LINES.some((l) => l.includes(i) && l.filter((x) => x !== i).every((x) => this.cells[x]?.owner === who))) ?? null;
  }

  checkEnd() {
    for (const l of LINES) {
      const w = this.cells[l[0]]?.owner;
      if (w !== undefined && l.every((x) => this.cells[x]?.owner === w)) {
        l.forEach((x) => (this.cells[x].winning = true));
        this.endRound(w); return true;
      }
    }
    if ([...Array(9).keys()].every((i) => this.cells[i] || !this.correct(i).length)) { this.endRound(null); return true; }
    return false;
  }

  endRound(winner) {
    this.review = null; this.mismatch = null; this.oppSelected = null; this.roundOver = true; this.roundWinner = winner; this.selected = null;
    if (winner !== null) this.score[winner]++;
    this.roundResults.push(winner);
    this.moveToken = id();
    this.finishedAt = Date.now(); this.finishSignal++;
    // From the stands the players start the next round; here it starts by itself a few seconds on.
    if (this.watching && !this.matchOver) { const r = this.round; this.later(5, () => { if (this.round === r && this.roundOver) this.nextRound(); }); }
  }

  nextRound() {
    this.nextAsked = false; this.paused = false; this.pauseAskLeft = null; this.oppPauseAskLeft = null; this.resumeWait = null;
    this.round++;
    this.cells = Array(9).fill(null); this.used = new Set();
    this.turn = this.opener(this.round); this.seconds = 60; this.turnLength = 60; this.hintThisTurn = false; this.selected = null; this.roundOver = false; this.roundWinner = null;
    this.raiseAnswered = false; this.review = null; this.oppSelected = null; this.sharedClues = {};
    if (this.turn === 1 || this.watching) this.opponentMove();
  }

  /** A rematch: the bot agrees at once; a person is asked and answers in a moment (or has left). */
  rematch() {
    if (this.oppLeft) return;
    if (this.opponent.isBot) { this.startRematch(); return; }
    if (this.rematchAsked) return;
    this.rematchAsked = true; this.readyTotal = Match.rematchTimeout; this.readyLeft = this.readyTotal;
    this.show(`Реванш предложен · ждём ${this.opponent.name}`, true);
    if (has("demoOppLeaves")) { this.later(6, () => this.opponentQuit()); return; }
    this.answerReady();
  }
  askNextRound() {
    if (this.oppLeft) return;
    if (this.opponent.isBot || this.watching) { this.nextRound(); return; }
    if (this.nextAsked) return;
    this.nextAsked = true; this.readyTotal = Match.nextTimeout; this.readyLeft = this.readyTotal;
    this.answerReady();
  }
  answerReady() {
    if (demoIdle) return;
    this.later(1.5, () => {
      if (this.oppLeft) return;
      if (this.rematchAsked) { this.show(`${this.opponent.name} принял реванш`, true); this.startRematch(); }
      else if (this.nextAsked) this.nextRound();
    });
  }
  /** When the opponent does not respond, you may leave without it counting against you. */
  get canLeaveFree() {
    if (this.opponent.isBot || this.watching || this.oppLeft) return false;
    if (this.paused) return (this.resumeWait ?? 0) >= Match.resumeTimeout;
    if (!this.roundOver) return this.oppMissed >= 2;
    return (this.rematchAsked || this.nextAsked) && this.readyLeft <= this.readyTotal - Math.floor(this.readyTotal / 3);
  }
  tickReady() {
    if (!(this.rematchAsked || this.nextAsked) || this.oppLeft) return;
    this.readyLeft--;
    if (this.readyLeft <= 0) this.opponentQuit(true);
  }
  startRematch() {
    this.rematchAsked = false; this.nextAsked = false;
    this.score = [0, 0]; this.round = 0; this.tokens = 4; this.oppTokens = 4; this.awaySeconds = 45; this.oppAwayBudget = 45; this.oppAwayFor = null; this.roundResults = [];
    this.nextRound();
  }
  opponentQuit(idle = false) {
    if (this.oppLeft) return;
    this.oppLeft = true; this.oppAwayFor = null; this.oppSelected = null;
    const wasAsked = this.rematchAsked;
    this.rematchAsked = false; this.nextAsked = false;
    if (this.roundOver && !this.matchOver) {
      this.score[0] = 2;
      this.show(idle ? `${this.opponent.name} не подтвердил готовность и покинул матч — победа за тобой` : `${this.opponent.name} покинул матч — победа за тобой`, true);
      return;
    }
    if (!this.matchOver) { this.show(`${this.opponent.name} покинул матч — победа за тобой`, true); this.score[0] = 2; this.endRound(0); return; }
    this.show(idle ? `${this.opponent.name} не ответил — реванша не будет` : wasAsked ? `${this.opponent.name} ушёл — реванша не будет` : `${this.opponent.name} покинул матч`, false);
  }

  stop() { this.alive = false; this.moveToken = id(); }
  show(text, good) { this.toast = { text, good, id: id() }; }
}
