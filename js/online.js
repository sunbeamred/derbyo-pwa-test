// A real match on the site's server, behind the same face as the local Match (model.js), so the screens read
// either. The server owns everything; this turns its room state into "you" (owner 0) and "the other side" (owner 1).
import { store, LEVELS, Hints, botName } from "./model.js";
import { api, openStream, uuid, savedSession, account } from "./net.js";

const HINT_LEVEL = { profile: 1, letters: 2, four: 3 };
const HINT_ID = [null, "profile", "letters", "four"];
const POSITION = { G: "Вратарь", D: "Защитник", M: "Полузащитник", F: "Нападающий" };
const TROPHY = { WC: "trophy-wc", EURO: "trophy-euro", UCL: "trophy-ucl", COPA: "copa-america" };

/** A board condition from the server, in the shape the board draws (title, icon, note). */
export function criterion(c) {
  const title = c.label ?? c.key;
  let icon;
  switch (c.type) {
    case "c": icon = c.badge ? { kind: "crest", src: `https://media.api-sports.io/football/teams/${c.badge}.png` }
      : c.logo && /^https:\/\/a\.espncdn\.com\//.test(c.logo) ? { kind: "crest", src: c.logo } : { kind: "text", text: title.slice(0, 2).toUpperCase() }; break;
    case "n": icon = { kind: "flag", emoji: c.flag ?? "🏳️" }; break;
    case "l": icon = { kind: "league", emoji: c.flag ?? "🏳️" }; break;
    case "p": icon = { kind: "image", src: `/icons/position-${c.key}.webp` }; break;
    case "a": icon = { kind: "image", src: c.key === "BDOR" ? "/icons/golden-ball.webp" : "/icons/trophy.webp" }; break;
    case "t": icon = { kind: "image", src: `/icons/${TROPHY[c.key] ?? "trophy"}.webp` }; break;
    case "m": case "w": icon = { kind: "person", person: c.person, frame: `/icons/frame-${c.type === "m" ? "coach" : "teammate"}.webp` }; break;
    default: icon = { kind: "text", text: "?" };
  }
  return { key: c.id, title: c.type === "p" ? POSITION[c.key] ?? title : title, icon, note: c.note ?? null };
}

export class OnlineMatch {
  constructor(session, { onClosed } = {}) {
    this.online = true;
    this.session = session;
    this.code = session.code ? `${session.code.slice(0, 3)} ${session.code.slice(3)}` : "";
    this.state = null; this.g = null;
    this.offset = 0;
    this.onClosed = onClosed;
    this.alive = true;
    // What the screens read; filled from each state.
    this.cells = Array(9).fill(null); this.rows = []; this.cols = [];
    this.score = [0, 0]; this.round = 0; this.roundResults = []; this.seconds = 0; this.turn = 0; this.mySeat = 0;
    this.tokens = 0; this.oppTokens = 0; this.selected = null; this.oppSelected = null; this.sharedClues = {};
    this.review = null; this.mismatch = null; this.paused = false; this.resumeWait = null; this.pauseAskLeft = null; this.oppPauseAskLeft = null;
    this.roundOver = true; this.roundWinner = null; this.chat = []; this.viewers = []; this.unread = 0; this.seenChat = new Set();
    this.toast = null; this.reward = null; this.recent = null; this.landed = null; this.missSignal = 0; this.finishSignal = 0; this.timerAlert = 0;
    this.myReaction = null; this.oppReaction = null; this.oppMissed = 0; this.oppAwayFor = null; this.oppAwayBudget = 45; this.awaySeconds = 45;
    this.oppLeft = false; this.rematchAsked = false; this.nextAsked = false; this.readyLeft = 0; this.readyTotal = 60;
    this.relation = "none"; this.viewerRelations = {}; this.used = new Set();
    this.seenEvents = new Set(); this.firstState = true;
    this.myName = account.name; this.myFlag = null;
    this.opponent = { name: "соперник", isBot: false, flag: null, rating: null, rank: null, present: null };
    savedSession.set(session);
    this.stopStream = openStream(session.token, (f) => this.frame(f));
    // Where I am (in the app or minimised) is told on every change and again every 15 s: on iPhone the network wakes
    // after the app does, and one lost «active» used to leave the server counting my time away down to a lost round.
    // The `id` makes api() retry it like any safe request.
    const presence = () => this.post("/api/presence", { id: uuid(), status: document.hidden ? "hidden" : "active" }).catch(() => {});
    this.pulse = setInterval(presence, 15000);
    this.onVisibility = presence;
    document.addEventListener("visibilitychange", this.onVisibility);
    this.onHide = () => { try { navigator.sendBeacon?.("/api/presence", new Blob([JSON.stringify({ status: "hidden", token: session.token })], { type: "application/json" })); } catch {} };
    addEventListener("pagehide", this.onHide);
  }

  post(path, body) { return api(path, body, { token: this.session.token }); }
  /** An action on the server: an idempotency id, the round and the turn it was meant for. */
  async act(type, extra = {}) {
    const g = this.g;
    try {
      const r = await this.post("/api/action", { id: uuid(), type, game: g?.id ?? null, turn: g?.turnVersion, ...extra });
      if (r.session) this.adopt(r.session);
      return r.result ?? {};
    } catch (e) {
      this.show(e.message, false); store.changed();
      throw e;
    }
  }
  adopt(s) {
    this.session = s; savedSession.set(s);
    this.stopStream?.(); this.stopStream = openStream(s.token, (f) => this.frame(f));
  }

  // MARK: the stream

  frame(f) {
    if (!this.alive) return;
    if (f.type === "clock") { this.offset = f.serverNow - Date.now(); return; }
    if (f.type === "replaced" || f.type === "closed") {
      this.closed = f.message || "Комната закрыта";
      this.stop(false);
      this.onClosed?.(this.closed);
      store.changed();
      return;
    }
    if (f.type === "state") {
      if (f.state.transfer) this.adopt(f.state.transfer);
      this.apply(f.state);
      store.changed();
    }
  }
  now() { return Date.now() + this.offset; }
  owner(seat) { return seat === null || seat === undefined ? null : seat === this.mySeat ? 0 : 1; }

  apply(st) {
    // The site's training bot is «Скаут Боб»; the app names bots like «Бот Oliver», one name per match.
    if (JSON.stringify(st.players ?? []).includes("Скаут Боб")) {
      this.botName ??= botName();
      st = JSON.parse(JSON.stringify(st).replaceAll("Скаут Боб", this.botName));
    }
    const before = this.g;
    this.state = st;
    this.offset = st.serverNow - Date.now();
    this.watching = st.role !== "player";
    // One phone (sandbox): the left side is whoever is to move; a disputed answer is shown to the side deciding it.
    this.hotseat = !!st.hotseat;
    this.mySeat = this.hotseat && st.game?.stage === "play" ? (st.game.review ? 1 - st.game.review.owner : st.game.turn ?? 0) : st.seat ?? 0;
    this.isHost = st.isHost;
    const me = st.players[this.mySeat], them = st.players[1 - this.mySeat];
    this.me = me; this.them = them;
    // A spectator keeps each seat's last name: a player who leaves stays named, never replaced by the viewer's own nick.
    this.seatNames ??= [];
    st.players.forEach((p, i) => { if (p) this.seatNames[i] = p.name; });
    this.myName = me?.name ?? (this.watching ? this.seatNames[this.mySeat] ?? "Игрок" : account.name);
    this.meLeft = this.watching && !me && st.round > 0;
    this.myFlag = this.hotseat ? null : this.watching ? (me && !me.bot ? flagOrGlobe(me.card?.country) : null) : account.profile?.registered === false ? null : account.profile?.showFlag === false ? "🌐" : flagOrGlobe(me?.card?.country ?? account.profile?.country);
    this.opponent = { name: them?.name ?? this.seatNames[1 - this.mySeat] ?? "Ждём соперника", isBot: !!them?.bot, flag: them && !them.bot ? flagOrGlobe(them.card?.country) : null, rating: them?.card?.rating ?? null, rank: them?.card?.rank ?? null, present: !!them };
    // Newer servers (the sandbox) add rematch offers, harder rounds, free leave, reactions; on others these stay off.
    this.rematchOffer = st.rematch ?? null;
    this.rematchAsked = this.rematchOffer?.by === this.mySeat;
    this.oppRematch = !!this.rematchOffer && this.rematchOffer.by !== this.mySeat;
    // My offer went unanswered (expired, declined, opponent left): the button stays «Новый соперник».
    if (this.rematchAsked) this.myRematchSent = true;
    else if (!this.rematchOffer && !st.rematchClosed) this.myRematchSent = false;
    this.rematchUnanswered = !this.rematchOffer && !!st.rematchClosed && !!this.myRematchSent;
    this.raise = st.raise ?? null;
    // A draw for the whole match, after three drawn rounds in a row (the site's rule): offered by one, agreed by the other.
    this.drawOffer = this.watching || !st.drawOffer ? null : st.drawOffer === st.selfId ? "mine" : "theirs";
    this.canOfferDraw = !this.watching && !!st.canAgreeDraw && !st.drawOffer;
    this.freeLeave = this.watching ? null : st.freeLeave ?? null;
    this.reactions(st.reactions);
    this.score = [st.score[this.mySeat] ?? 0, st.score[1 - this.mySeat] ?? 0];
    this.round = st.round;
    this.roundResults = (st.roundResults ?? []).map((r) => this.owner(r.winner));
    this.viewers = (st.viewers ?? []).map((v) => v.name);
    this.chat = (st.chat ?? []).map((c) => ({ id: c.id, who: c.senderId === st.selfId ? "Ты" : c.name, text: c.text, kind: "text", spectator: c.role === "spectator", likes: c.likeCount ?? 0, liked: !!c.liked }));
    for (const c of st.chat ?? []) if (!this.seenChat.has(c.id)) { this.seenChat.add(c.id); if (!this.firstState && c.senderId !== st.selfId) this.unread++; }
    this.oppLeft = !them && st.round > 0;
    this.matchOver = !!st.seriesComplete;
    this.levelSetting = st.settings?.level ?? 2;

    const g = st.game;
    this.g = g;
    if (!g) { this.roundOver = true; this.firstState = false; return; }
    this.rows = g.rows.map(criterion); this.cols = g.cols.map(criterion);
    this.turn = this.owner(g.turn);
    this.roundOver = g.stage !== "play";
    this.roundWinner = this.roundOver ? this.owner(g.winner) : null;
    this.used = new Set(g.cells.filter((c) => c?.id).map((c) => c.id));
    this.cells = g.cells.map((c, i) => !c ? null : c.blocked ? { blocked: true, owner: null }
      : { owner: this.owner(c.owner), playerId: c.id, name: c.name, photo: c.photo, wp: c.wp, winning: !!g.line?.includes(i), manual: c.manual });
    this.tokens = g.wallets?.[this.mySeat] ?? 0; this.oppTokens = g.wallets?.[1 - this.mySeat] ?? 0;
    this.scout = !!g.scout;
    // From the stands either player's pick shows; a player sees only the other side's.
    this.oppSelected = !this.roundOver && (this.watching || g.turn !== this.mySeat) ? g.selected : null;
    if (this.turn !== 0 || this.roundOver) this.selected = null;
    this.sharedClues = {};
    g.clues?.forEach((c, i) => { if (c) this.sharedClues[i] = { open: (c.purchased ?? []).map((l) => HINT_ID[l]), facts: c.facts, mask: c.mask, options: c.options?.map((o) => ({ id: o.id, name: o.name, used: o.used })) }; });
    this.review = g.review ? { id: g.review.id, owner: this.owner(g.review.owner), cell: g.review.cell, name: g.review.name, playerId: null, until: g.review.until, left: 20 } : null;
    this.paused = !!g.paused;
    this.choices = g.choices ?? null;
    this.mismatch = g.mismatch ? { cell: g.mismatch.cell, playerId: g.mismatch.player, name: g.mismatch.name, why: g.mismatch.why } : null;
    this.oppMissed = g.missed?.[1 - this.mySeat] ?? 0;
    const pr = g.pauseRequest;
    this.pauseRequest = pr;
    this.resume = g.resume;
    this.level = LEVELS[(g.level ?? 2) - 1] ?? "";
    this.levelIndexNow = (g.level ?? 2) - 1;
    this.nextAsked = this.roundOver && !this.matchOver && !!me?.ready;
    // A Legend board in place of the planned Encyclopedia: say why once, when the round starts.
    if (this.breather && !this.roundOver && this.breatherShown !== g.id) { this.breatherShown = g.id; this.show("Легенда — передышка после ничьей на Энциклопедии", true); }
    this.events(g, before);
    this.clock();
    this.firstState = false;
  }

  /** A new reaction shows over the avatar of whoever sent it. */
  reactions(list) {
    if (!Array.isArray(list)) return;
    for (const x of list) {
      if (this.seenEvents.has(`x:${x.id}`)) continue;
      this.seenEvents.add(`x:${x.id}`);
      if (this.firstState) continue;
      // Reactions from the stands have no avatar to rise over.
      if (x.seat !== 0 && x.seat !== 1) continue;
      // My own reaction already shows from the tap; its echo from the server must not pop it a second time.
      if (x.seat === this.mySeat && this.myReaction?.local && this.myReaction.e === x.emoji) { this.myReaction.local = false; continue; }
      const r = { e: x.emoji, n: x.id };
      if (x.seat === this.mySeat) this.myReaction = r; else this.oppReaction = r;
    }
  }

  /** New things since the last state become the screen's signals: a capture lands, a miss shakes, a toast. */
  events(g, before) {
    // Round events and room events count from 1 each (and a round's restart with every new round): key them apart.
    const keyed = [...(g.events ?? []).map((e) => [`g:${g.id}:${e.id}`, e]), ...(this.state.events ?? []).map((e) => [`r:${e.id}`, e])];
    const fresh = keyed.filter(([k]) => !this.seenEvents.has(k)).map(([k, e]) => (this.seenEvents.add(k), e));
    if (this.firstState) { if (this.roundOver) this.finishSignal = 0; return; }
    if (before?.id === g.id && before.stage === "play" && g.stage !== "play") this.finishSignal++;
    for (const e of fresh.sort((a, b) => a.at - b.at)) {
      const mine = e.seat === this.mySeat;
      switch (e.type) {
        case "capture":
          this.landed = { i: e.cell, n: e.id }; this.recent = e.cell;
          setTimeout(() => { if (this.recent === e.cell) { this.recent = null; store.changed(); } }, 2500);
          if (mine && !this.watching && (e.fast || e.bonus)) this.reward = { id: e.id, title: e.bonus ? "+1 жетон" : "Быстрый ответ!", detail: e.fast ? "+10 секунд на следующий ход" : "Два самостоятельных ответа подряд", coins: !!e.bonus, fast: !!e.fast, cell: e.cell };
          else if (g.stage === "play") this.show(mine && !this.watching ? `${e.text} — клетка твоя` : `${e.actorName}: ${e.text}`, mine);
          break;
        case "miss": this.missSignal++; this.show(e.text ? `${e.actorName ?? ""} ${e.text}`.trim() : "Ход переходит", false); break;
        case "finish": break;
        case "rematch": case "raise":
          if (e.text && !mine) this.show(`${e.actorName ?? ""}: ${e.text}`.replace(/^: /, ""), true);
          break;
        // Leaving is already on screen (pill, bubble with the countdown, sound); only the return gets a line, in the bubble's words.
        case "connect": if (!mine && !this.watching && g.stage === "play") this.show(`${e.actorName ?? this.opponent.name} вернулся в игру`, true); break;
        case "disconnect": case "pause_request": break;
        case "hint": case "review": case "pause": case "resume": case "join": case "absence": case "hide-budget": case "viewer":
          if (e.text) this.show(e.actorName && !e.text.includes(e.actorName) ? `${e.actorName}: ${e.text}` : e.text, e.type === "resume" || e.type === "connect" || e.type === "join");
          break;
      }
    }
  }

  /** Seconds from the server's deadlines; the app calls this every second. */
  clock() {
    const g = this.g;
    if (!g) return;
    const now = this.now();
    const prev = this.seconds;
    this.seconds = g.deadline ? Math.max(0, Math.ceil((g.deadline - now) / 1000)) : g.remaining ? Math.ceil(g.remaining / 1000) : g.seconds || 0;
    if (this.review) this.review.left = Math.max(0, Math.ceil((this.review.until - now) / 1000));
    const pr = this.pauseRequest;
    const left = pr && pr.until > now ? Math.ceil((pr.until - now) / 1000) : null;
    this.pauseAskLeft = pr?.by === this.mySeat ? left : null;
    this.oppPauseAskLeft = pr && pr.by !== this.mySeat ? left : null;
    if (this.paused && this.resume?.[this.mySeat] && !this.resume?.[1 - this.mySeat]) { this.resumeSince ??= now; this.resumeWait = Math.round((now - this.resumeSince) / 1000); }
    else { this.resumeSince = null; this.resumeWait = null; }
    const them = this.them, me = this.me;
    const until = them?.awayDeadline ?? them?.returnDeadline;
    this.oppAwayFor = them && (until || !them.online || them.status === "hidden") && !this.roundOver ? Math.max(0, Math.round((now - (them.since ?? now)) / 1000)) : null;
    // Why a side is away, as the site says it: the tab hidden, another window, or the connection lost.
    const why = (p) => (p?.status === "hidden" ? "hidden" : p?.status === "blurred" ? "blurred" : "offline");
    this.oppAwayKind = this.oppAwayFor === null ? null : why(them);
    // From the stands the left player can be away too.
    const mineUntil = me?.awayDeadline ?? me?.returnDeadline;
    this.leftAwayFor = this.watching && me && (mineUntil || !me.online || me.status === "hidden") && !this.roundOver ? Math.max(0, Math.round((now - (me.since ?? now)) / 1000)) : null;
    this.leftAwayKind = this.leftAwayFor === null ? null : why(me);
    this.leftAwayBudget = mineUntil ? Math.max(0, Math.ceil((mineUntil - now) / 1000)) : Math.round((me?.hideLeftMs ?? this.awayTotal * 1000) / 1000);
    // Rings scale to the server's own numbers: the level's time-away budget (45…25 s), the deadline's whole span, the room's turn time.
    this.awayTotal = g.hideBudget ? Math.round(g.hideBudget / 1000) : 45;
    this.oppAwayTotal = until && them?.since ? Math.max(1, Math.round((until - them.since) / 1000)) : this.awayTotal;
    this.turnTotal = this.state?.settings?.seconds || 60;
    this.oppAwayBudget = until ? Math.max(0, Math.ceil((until - now) / 1000)) : Math.round((them?.hideLeftMs ?? this.awayTotal * 1000) / 1000);
    // Shown only once some of the budget is spent; levels without a budget never show it.
    this.awaySeconds = g.hideBudget && me && me.hideLeftMs < g.hideBudget ? Math.round(me.hideLeftMs / 1000) : this.awayTotal;
    // Waiting for the other player: a rematch I offered, or the next round I am ready for.
    const st = this.state;
    const waitUntil = this.rematchAsked ? this.rematchOffer.until : this.nextAsked ? st.readyDeadline : null;
    if (waitUntil) { this.readyLeft = Math.max(0, Math.ceil((waitUntil - now) / 1000)); this.readyTotal = this.rematchAsked ? 30 : Math.round((st.readyTotal ?? 90000) / 1000); }
    if (this.turn === 0 && !this.watching && !this.roundOver && !this.paused && (this.seconds === 15 || this.seconds === 5) && prev !== this.seconds) {
      this.timerAlert++;
    }
  }
  tick() { this.clock(); }

  // MARK: what the screens read (same names as the local model)

  get leftName() { return this.me?.name ?? this.myName; }
  name(owner) { return owner === 0 ? this.leftName : this.opponent.name; }
  seat(owner) { return owner === 0 ? this.mySeat : 1 - this.mySeat; }
  mark(owner) { return this.seat(owner) === 0 ? "mark-x" : "mark-o"; }
  get myRating() { return this.me?.card?.rating ?? account.profile?.rating ?? null; }
  get myRank() { return this.me?.card?.rank ?? account.profile?.rank ?? null; }
  get levelPath() {
    const i = this.levelIndexNow ?? (this.levelSetting - 1), last = LEVELS.length - 1;
    const from = Math.max(0, Math.min(last - 2, this.round <= 1 ? i : i - 1));
    const out = [];
    for (let k = from; k <= Math.min(last, from + 2); k++) out.push({ name: LEVELS[k], current: k === i });
    return out;
  }
  /** The ready level planned for round n (a quick game or a room with several levels). */
  plannedPreset(n) { const p = this.state?.settings?.roundPresets; return p?.[n - 1] ?? p?.at(-1) ?? null; }
  /** The site plays a Legend board after a drawn Encyclopedia round, never two such boards in a row. This round is one. */
  get breather() { return this.plannedPreset(this.round) === "encyclopedia" && this.g?.level === 4; }
  /** …and the next round will be one: this Encyclopedia round ended in a draw. */
  get nextBreather() { return this.roundOver && !this.matchOver && this.roundWinner === null && this.g?.level === 5 && this.plannedPreset(this.round + 1) === "encyclopedia"; }
  get nextLevel() {
    if (this.nextBreather) return LEVELS[3];
    if (Number.isFinite(this.state?.nextLevel)) return LEVELS[this.state.nextLevel - 1];
    const p = this.state?.settings?.roundPresets?.[this.round];
    const lv = p ? { easy: 1, amateur: 2, medium: 3, hard: 4, encyclopedia: 5 }[p] : this.state?.settings?.progressive ? Math.max((this.levelIndexNow ?? 1) + 1, Math.min(4, (this.levelIndexNow ?? 1) + 2)) : (this.levelIndexNow ?? 1) + 1;
    return LEVELS[(lv ?? 2) - 1];
  }
  /** «Снова ничья — сложнее?»: shown until you answer; the other side's offer is answered with the same buttons. */
  /** The level of round n by the room's rules (quick-game presets, or one up per round, or fixed). */
  levelOfRound(n) {
    const s = this.state?.settings ?? {}, byPreset = { easy: 1, amateur: 2, medium: 3, hard: 4, encyclopedia: 5 };
    if (s.roundPresets?.length) return byPreset[s.roundPresets[n - 1] ?? s.roundPresets.at(-1)] ?? s.level ?? 2;
    // One up per round up to «Легенда»; a room that starts at «Энциклопедия» stays there (site, 29 Oct).
    return s.progressive ? Math.max(s.level ?? 2, Math.min(4, (s.level ?? 2) + n - 1)) : s.level ?? 2;
  }
  /** Rising difficulty: the level before, the current one and the next; null when every round has the same level. */
  get levelChain() {
    const s = this.state?.settings ?? {};
    const rises = s.progressive || new Set((s.roundPresets ?? []).map((p) => p)).size > 1 || (this.state?.levelBoost ?? 0) > 0;
    if (!rises) return null;
    const cur = this.g?.level ?? this.levelOfRound(Math.max(1, this.round));
    const prev = this.round > 1 ? this.levelOfRound(this.round - 1) : null;
    const next = this.nextBreather ? 4 : Number.isFinite(this.state?.nextLevel) ? this.state.nextLevel : this.levelOfRound(this.round + 1);
    return { prev: prev && prev !== cur ? LEVELS[prev - 1] : null, cur: LEVELS[cur - 1], next: next && next !== cur ? LEVELS[next - 1] : null };
  }
  offerDraw() { this.act("offer_draw").then(() => store.changed()).catch(() => {}); }
  /** My open offer stays on screen as a quiet line, like the opponent's offer stays as a card. */
  get myOffer() {
    if (this.watching) return null;
    if (this.drawOffer === "mine") return `Ничья предложена · ждём ${this.opponent.name}`;
    if (this.raise?.by === this.mySeat && this.state?.canRaise) return `Сложнее предложено · ждём ${this.opponent.name}`;
    return null;
  }
  answerDraw(yes) { this.act(yes ? "accept_draw" : "decline_draw").catch(() => {}); }
  get offerRaise() { return !!this.state?.canRaise && this.raise?.by !== this.mySeat; }
  get raisedLevel() { return LEVELS[Math.min(LEVELS.length - 1, (this.state?.nextLevel ?? this.levelIndexNow + 1))]; }
  raiseLevel(yes) {
    const answer = this.raise ? (yes ? "accept_raise" : "decline_raise") : yes ? "offer_raise" : "decline_raise";
    this.act(answer).then(() => store.changed()).catch(() => {});
  }
  /** The server says when you may leave without it counting: the other side stopped answering. */
  get canLeaveFree() { return !!this.freeLeave; }
  /** A match the quick search found (its rematches too): a new opponent comes from the same search; a room match leads back to the menu. */
  get fromQuick() { return !!this.state?.quick; }
  get hasBoard() { return !!this.g; }

  profile(owner) {
    const m = owner === 0 ? this.me : this.them;
    const c = m?.card;
    if (c && (c.games || c.rating != null)) return { name: m.name, photo: c.avatar ?? null, flag: flagOrGlobe(c.country), rating: c.rating, rank: c.rank, level: c.level, games: c.games, winRate: c.games ? Math.round((c.wins / c.games) * 100) : 0, bestStreak: c.bestStreak };
    if (owner === 0 && account.profile && !this.watching && !this.hotseat) {
      const p = account.profile;
      return { name: this.leftName, flag: this.myFlag, rating: p.rating, rank: p.rank, level: p.level, games: p.games, winRate: p.games ? Math.round((p.wins / p.games) * 100) : 0, bestStreak: p.bestStreak };
    }
    return { name: m?.name ?? "—", flag: null, rating: null, rank: null, level: null, games: null, winRate: null, bestStreak: null };
  }
  /** A player's profile photo (the sandbox stores them); the site has none. */
  avatarOf(owner) { return (owner === 0 ? this.me : this.them)?.card?.avatar ?? (owner === 0 && !this.watching && !this.hotseat ? account.profile?.avatar : null) ?? null; }
  viewerProfile(v) {
    // You in the stands: your own account's numbers.
    const p = v === account.name ? account.profile : null;
    if (p && (p.games || p.rating != null)) return { name: v, photo: p.avatar ?? null, flag: null, rating: p.rating, rank: p.rank, level: p.level, games: p.games, winRate: p.games ? Math.round((p.wins / p.games) * 100) : 0, bestStreak: p.bestStreak };
    return { name: v, flag: null, rating: null, rank: null, level: null, games: null, winRate: null, bestStreak: null };
  }
  get headToHead() { return null; }
  relationWith() { return "none"; }
  isBlocked() { return false; }

  // MARK: moves

  select(i) {
    if (this.turn !== 0 || this.watching || this.roundOver || this.paused || this.review || this.cells[i]) return;
    this.selected = i;
    this.act("select", { cell: i }).catch(() => {});
  }
  /** Names a player for the selected cell. Resolves to "captured" | "review" | "choices" | "used" | "unknown" | "none". */
  async answer(pl) {
    const i = this.selected;
    if (i === null) return "none";
    if (this.used.has(pl.id)) return "used";
    // `hold`: a player who does not fit waits with you (cancel or ask for review); older servers ignore it.
    const r = await this.act(this.choices?.cell === i && this.choices.candidates.some((c) => c.id === pl.id) ? "choose" : "guess", { cell: i, player: pl.id, hold: true }).catch(() => null);
    if (!r) return "none";
    if (r.kind === "mismatch") { this.mismatch = { cell: i, playerId: pl.id, name: pl.name, why: r.why, photo: pl.photo, wp: pl.wp }; return "mismatch"; }
    if (r.message) this.show(r.message, r.kind === "accepted");
    return r.kind === "accepted" ? "captured" : r.kind === "review" ? "review" : r.kind === "choices" ? "choices" : r.kind === "unknown" ? "unknown" : "none";
  }
  cancelMismatch() {
    const mm = this.mismatch;
    this.mismatch = null;
    if (mm && this.g?.mismatch) this.act("cancel_mismatch", { cell: mm.cell }).catch(() => {});
  }
  /** Autocomplete over the whole base; it does not say whether the player fits. */
  async search(q) {
    const r = await this.post("/api/search", { query: q });
    return r.players.map((p) => ({ ...p, born: p.birthYear, initials: initials(p.name) }));
  }
  async buy(hint, i) {
    const level = HINT_LEVEL[hint.id];
    if (this.tokens < hint.cost) return false;
    await this.act("hint", { cell: i, level });
    return true;
  }
  requestReview() { const mm = this.mismatch; if (mm) { this.mismatch = null; this.act("request_review", { cell: mm.cell }).catch(() => {}); } }
  decideReview(accept) { if (this.review?.owner === 1) this.act("review_decide", { review: this.review.id, accept }).catch(() => {}); }
  passOnPurpose() { this.act("pass").catch(() => {}); }
  surrender() { this.act("resign").catch(() => {}); }
  requestPause() { this.act("pause").catch(() => {}); }
  acceptPause() { this.act("pause").catch(() => {}); }
  requestResume() { this.act("resume").catch(() => {}); }
  askNextRound() { this.act("ready").catch(() => {}); }
  ready() { return this.act("ready"); }
  unready() { return this.act("unready"); }
  /** After the match: either player offers a rematch and the other accepts (newer servers); otherwise the host restarts. */
  async rematch() {
    if ("rematch" in (this.state ?? {})) { await this.act(this.oppRematch ? "accept_rematch" : "offer_rematch").catch(() => {}); return; }
    if (this.isHost) { await this.act("new_series").catch(() => {}); this.act("ready").catch(() => {}); }
    else this.show("Реванш начинает создатель комнаты — ждём его", true);
  }
  react(e) {
    this.myReaction = { e, n: uuid(), local: true };
    if (Array.isArray(this.state?.reactions)) this.act("reaction", { emoji: e }).catch(() => {}); else this.send(e);
  }
  send(text) { this.act("chat", { text }).catch(() => {}); }
  /** A heart for someone else's chat message (a double tap, as the site's double click). */
  likeMessage(id) {
    const c = this.chat.find((x) => x.id === id);
    if (!c || c.who === "Ты" || c.liked) return;
    c.liked = true; c.likes++;
    this.act("chat_like", { message: id }).catch(() => {});
  }
  /** Respect for the opponent's last capture: a double tap on that card, as on the site. */
  canRespect(i) { const r = this.state?.respect; return !!r && !this.watching && r.cell === i && r.seat !== this.state.seat && !r.liked; }
  respectCount(i) { return this.state?.respect?.awards?.find((x) => x.cell === i)?.count ?? 0; }
  respectMove() {
    const r = this.state?.respect;
    if (!r || !this.canRespect(r.cell)) return;
    r.liked = true; const w = r.awards?.find((x) => x.capture === r.capture); if (w) w.count++; else (r.awards ??= []).push({ game: r.game, capture: r.capture, cell: r.cell, count: 1, liked: true });
    this.act("respect", { game: r.game, capture: r.capture }).catch(() => {});
  }
  sendFriendRequest() {} acceptFriend() {} block() {} report() { this.show("Жалобы — в версии сайта", false); }
  cameBack() {}
  addBot() { return this.act("add_bot", { seat: 1 - this.mySeat }); }
  settings(s) { return this.act("settings", { settings: s }); }
  /** The host switched the room's chat off (sandbox): no chat button in the match. */
  get chatOff() { return this.state?.settings?.chat === false; }

  /** Closes the screen's link; `leave` also leaves the room on the server (a live round is lost). */
  stop(leave = true) {
    if (!this.alive) return;
    this.alive = false;
    // When the other side stopped answering the server allows a leave that does not count against you.
    if (leave) this.post("/api/action", { id: uuid(), type: this.freeLeave ? "leave_free" : "leave", game: this.g?.id ?? null }).catch(() => {});
    this.stopStream?.(); clearInterval(this.pulse);
    document.removeEventListener("visibilitychange", this.onVisibility);
    removeEventListener("pagehide", this.onHide);
    savedSession.set(null);
  }
  show(text, good) { this.toast = { text, good, id: uuid() }; }
}

/** An ISO country code as its flag emoji (KZ → 🇰🇿). */
export const flagOf = (code) => (typeof code === "string" && /^[A-Z]{2}$/.test(code) ? String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)) : null);
/** A player's flag; a globe when the server has flags (sandbox) but this player hides theirs or has none. */
export const flagOrGlobe = (code) => flagOf(code) ?? (account.profile && "showFlag" in account.profile ? "🌐" : null);

export const initials = (name) => {
  const parts = String(name).trim().split(/\s+/);
  return (parts.length > 1 ? parts.map((w) => w[0]).join("") : String(name).slice(0, 2)).slice(0, 2).toUpperCase();
};
export { Hints };
