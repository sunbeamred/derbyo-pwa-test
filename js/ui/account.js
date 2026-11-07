// The «Рейтинг» and «Профиль» tabs on the site's data: the leaderboard; your account (guest, login, register),
// its photo and country (sandbox), friends, password and the phone's settings.
import { html, useState, useEffect, useRef, cx, img, Icon, rankTier, tierStyle, placeStyle, levelColor, Prefs, vibrate, flagView } from "./common.js";
import { account, leaderboard, playerProfile, social } from "../net.js";
import { Sound } from "../sound.js";
import { flagOf, flagOrGlobe } from "../online.js";
import { Panel } from "./common.js";
import { notifications, PUSH_KINDS } from "../push.js";
import { invites, secondsLeft } from "../invites.js";
import { BUILD } from "../update.js";

const PERIODS = [["rating", "Рейтинг"], ["week", "Неделя"], ["friends", "Друзья"]];

export function RatingTab({ visible }) {
  const [period, setPeriod] = useState("rating");
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [open, setOpen] = useState(null);
  const [palette, setPalette] = useState(null);
  useEffect(() => {
    if (!visible) return;
    let live = true;
    setErr(null);
    leaderboard(period).then((r) => live && setData(r)).catch((e) => live && setErr(e.message));
    return () => { live = false; };
  }, [period, visible, account.profile?.id]);
  const list = data?.period === period ? data.entries : null;
  return html`<div class="screen-scroll"><div class="page rating-page">
    ${list?.length && !data.requiresLogin ? html`<${WaveFlag} code=${list[0].country} visible=${visible} onPalette=${setPalette} />` : null}
    <h1 class="big-title">Рейтинг</h1>
    <div class="segmented">${PERIODS.map(([id, t]) => html`<button class=${period === id ? "on" : ""} onClick=${() => setPeriod(id)}>${t}</button>`)}</div>
    ${err ? html`<p class="hint-line pad">${err}</p>`
      : !list ? html`<p class="hint-line pad">Загружаем…</p>`
      : data.requiresLogin ? html`<p class="placeholder">Друзья видны после входа в аккаунт — вкладка «Профиль».</p>`
      : !list.length ? html`<p class="placeholder">${period === "week" ? "На этой неделе ещё никто не набрал очков." : "Пока пусто."}</p>`
      // The metal top three only on the main table; the week and friends stay a plain list.
      : html`${period === "rating" ? html`<${TopThree} top=${list.slice(0, 3)} period=${period} open=${setOpen} palette=${palette} />` : null}
        ${(period === "rating" ? list.slice(3) : list).length ? html`<div class="board-list glass">${(period === "rating" ? list.slice(3) : list).map((e) => html`<${BoardRow} e=${e} period=${period} open=${setOpen} />`)}</div>` : null}
        <p class="hint-line small center">Рейтинг — после 5 игр с двумя разными соперниками</p>`}
  </div>
  ${open ? html`<${Panel} onClose=${() => setOpen(null)}><${PlayerCard} id=${open} /><//>` : null}
  </div>`;
}

/** The leader's flag waving behind the table (owner, 2026-11-07). The flag comes from the app's vector flag font
 * (Twemoji Country Flags), drawn once onto a canvas at the screen's real pixel size, so it stays sharp; each frame the
 * cloth is redrawn in thin columns lifted by a sine wave, the free end moving more than the pole, with a light and a
 * shade running along. It sleeps while the tab is hidden; with reduced motion it is drawn once and stays still.
 * No country (or the flag hidden: the site sends no country then) — nothing is drawn. */
const FLAG_FONT = '"Twemoji Country Flags"';
async function flagCloth(code, width) {
  const f = flagOf(code);
  if (!f) return null;
  try { await document.fonts.load(`100px ${FLAG_FONT}`, f); } catch {}
  if (!document.fonts.check(`100px ${FLAG_FONT}`, f)) return null;
  // The glyph is a flat rectangle inside its em box: find its edges on a small copy, then draw it big.
  const probe = document.createElement("canvas"); probe.width = 160; probe.height = 160;
  const pg = probe.getContext("2d", { willReadFrequently: true });
  pg.textBaseline = "middle"; pg.textAlign = "center"; pg.font = `120px ${FLAG_FONT}`; pg.fillText(f, 80, 80);
  const d = pg.getImageData(0, 0, 160, 160).data;
  let x0 = 160, y0 = 160, x1 = -1, y1 = -1;
  for (let y = 0; y < 160; y++) for (let x = 0; x < 160; x++) if (d[(y * 160 + x) * 4 + 3] > 200) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 - x0 < 40 || y1 - y0 < 20) return null;
  const k = width / (x1 - x0 + 1), w = Math.round(width), h = Math.round((y1 - y0 + 1) * k);
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const g = c.getContext("2d");
  g.textBaseline = "middle"; g.textAlign = "center"; g.font = `${120 * k}px ${FLAG_FONT}`;
  // Slightly overscaled so the glyph's rounded corners fall outside: a crisp rectangle of cloth.
  g.save(); g.translate(w / 2, h / 2); g.scale(1.03, 1.05); g.fillText(f, (80 - (x0 + x1 + 1) / 2) * k, (80 - (y0 + y1 + 1) / 2) * k); g.restore();
  return c;
}
/** The flag's own colours for the champion's ring: the most common colours of a small copy,
 * each clearly different from the ones already picked; near-black only when nothing else is there. */
function flagPalette(cloth) {
  const c = document.createElement("canvas"); c.width = 48; c.height = 32;
  const g = c.getContext("2d", { willReadFrequently: true }); g.drawImage(cloth, 0, 0, 48, 32);
  const d = g.getImageData(0, 0, 48, 32).data, n = new Map();
  for (let i = 0; i < d.length; i += 4) { if (d[i + 3] < 200) continue; const k = (d[i] >> 4) << 8 | (d[i + 1] >> 4) << 4 | d[i + 2] >> 4; n.set(k, (n.get(k) || 0) + 1); }
  const rgb = (k) => [((k >> 8) & 15) * 17, ((k >> 4) & 15) * 17, (k & 15) * 17];
  const far = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) > 110;
  // Colours covering under 3% of the cloth are edges and small details (a crescent's rim), not the flag's colours.
  const total = [...n.values()].reduce((a, b) => a + b, 0);
  const all = [...n.entries()].sort((x, y) => y[1] - x[1]).filter(([, v], i) => i === 0 || v >= total * 0.03).map(([k]) => rgb(k));
  const out = [];
  for (const c of all) { if (out.length === 3) break; if (Math.max(...c) < 60) continue; if (out.every((o) => far(o, c))) out.push(c); }
  if (!out.length && all.length) out.push(all[0]);
  return out.map(([r, g, b]) => `rgb(${r},${g},${b})`);
}
/** Round the flag (owner, 2026-11-08): the champion's ring in the flag's colours (via onPalette) and depth: on
 * scrolling the flag moves slower than the rows and fades. Confetti and a spotlight with dust were tried and dropped. */
function WaveFlag({ code, visible, onPalette }) {
  const ref = useRef(null), boxRef = useRef(null);
  const [ok, setOk] = useState(false);
  useEffect(() => {
    const canvas = ref.current, box = boxRef.current;
    if (!canvas || !code || !visible) return;
    let raf = 0, alive = true, cloth = null, last = 0, scrollY = 0;
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Depth: half speed and a fade over the first 320 px of scrolling.
    const scroller = box.closest(".screen-scroll");
    const onScroll = () => { scrollY = scroller.scrollTop; if (still) depth(); };
    const depth = () => { const y = Math.max(0, scrollY); box.style.transform = `translate3d(-50%, ${(y * 0.5).toFixed(1)}px, 0) scale(${(1 + y / 2400).toFixed(4)})`; box.style.opacity = Math.max(0, 1 - y / 320).toFixed(3); };
    scroller?.addEventListener("scroll", onScroll, { passive: true });
    const waveAt = (x, t) => { const u = x / cloth.width; return { ph: u * 9.5 - t * 0.0021, reach: 0.15 + 0.85 * u }; };
    const draw = (t) => {
      const g = canvas.getContext("2d"), W = canvas.width, H = canvas.height, cw = cloth.width, ch = cloth.height;
      g.clearRect(0, 0, W, H);
      const amp = ch * 0.055, top = (H - ch) / 2, step = Math.max(1, Math.round(W / 260));
      for (let x = 0; x < cw; x += step) {
        const { ph, reach } = waveAt(x, t);
        const dy = Math.sin(ph) * amp * reach;
        g.drawImage(cloth, x, 0, step, ch, x, top + dy, step, ch);
        const light = Math.cos(ph) * reach;                    // the slope of the wave: lit on one side, shaded on the other
        g.fillStyle = light > 0 ? `rgba(255,255,255,${(light * 0.16).toFixed(3)})` : `rgba(0,0,0,${(-light * 0.38).toFixed(3)})`;
        g.fillRect(x, top + dy, step, ch);
      }
    };
    const loop = (t) => { if (!alive) return; if (t - last > 30) { last = t; draw(t); depth(); } raf = requestAnimationFrame(loop); };
    (async () => {
      const r = box.getBoundingClientRect();
      cloth = await flagCloth(code, r.width);  // frosted anyway: screen points are enough, and lighter to redraw
      if (!alive) return;
      if (!cloth) { setOk(false); onPalette?.(null); return; }
      canvas.width = cloth.width; canvas.height = Math.round(cloth.height * 1.16);
      onPalette?.(flagPalette(cloth));
      setOk(true);
      onScroll(); depth();
      if (still) draw(0); else raf = requestAnimationFrame(loop);
    })();
    return () => { alive = false; cancelAnimationFrame(raf); scroller?.removeEventListener("scroll", onScroll); };
  }, [code, visible]);
  useEffect(() => { if (!code) onPalette?.(null); }, [code]);
  if (!code) return null;
  return html`<div class=${cx("wave-flag", ok && "on")} ref=${boxRef} aria-hidden="true">
    <canvas class="wf-cloth" ref=${ref}></canvas><span class="wf-glass"></span></div>`;
}

const scoreText = (e, period) => (period === "week" ? (e.points > 0 ? "+" : "") + e.points : e.rating);
const initials2 = (n) => (n || "?").slice(0, 2).toUpperCase();

/** One row of the table from fourth place down. */
function BoardRow({ e, period, open }) {
  return html`<button class=${cx("lb-row press", e.self && "self")} onClick=${() => open(e.id)}>
    <b class=${cx("lb-place num", placeStyle(e.rank) && "grad")} style=${placeStyle(e.rank)}>#${e.rank}</b>
    <${Face} name=${e.nickname} photo=${e.avatar} small=${true} /><span class="lb-name"><b>${flagOrGlobe(e.country) ? html`<i class="flag">${flagView(flagOrGlobe(e.country))}</i> ` : null}${e.nickname}</b><small>${e.games} игр · ${e.winRate}% побед</small></span>
    <b class="lb-pts grad num" style=${tierStyle(e.rating ?? 0)}>${scoreText(e, period)}</b>
  </button>`;
}

/** The first place as a full-width gold bubble: a neon ring runs round it and sparks rise from it;
 * second and third as silver and bronze below. Faces are rounded squares with the flag on the corner, as in the match. */
function TopThree({ top, period, open, palette }) {
  const face = (e) => {
    const flag = flagOrGlobe(e.country);
    return html`<span class="tt-face">${e.avatar ? html`<img src=${e.avatar} alt="" />` : html`<i>${initials2(e.nickname)}</i>`}
      ${flag ? html`<em class="tt-flag">${flagView(flag)}</em>` : null}</span>`;
  };
  const [first, second, third] = top;
  const small = (e, place) => e ? html`<button class=${cx("tt-card", place === 2 ? "silver" : "bronze", e.self && "self")} onClick=${() => open(e.id)}>
    <span class="tt-shine"></span><b class="tt-place">${place}</b>${face(e)}
    <span class="tt-name">${e.nickname}</span><b class="tt-score num">${scoreText(e, period)}</b>
  </button>` : html`<span></span>`;
  return html`<div class="top3">
    ${first ? html`<div class=${cx("tt-gold-wrap", palette?.length && "flag-ring")} style=${palette?.length ? palette.concat(palette, palette).slice(0, 3).map((c, i) => `--f${i + 1}:${c}`).join(";") : null}>
      <span class="tt-sparks" aria-hidden="true">${[...Array(10).keys()].map((i) => html`<i style=${`--x:${6 + i * 9.5}%;--d:${(i * 0.37) % 2.2}s;--t:${1.8 + (i % 4) * 0.35}s`}></i>`)}</span>
      <button class=${cx("tt-card gold", first.self && "self")} onClick=${() => open(first.id)}>
        <span class="tt-shine"></span>
        ${face(first)}
        <span class="tt-text"><small>ЧЕМПИОН · #1</small><b class=${cx("tt-name", first.nickname.length > 11 && "long")}>${first.nickname}</b><small>${first.games} игр · ${first.winRate}% побед</small></span>
        <b class="tt-score num">${scoreText(first, period)}</b>
      </button></div>` : null}
    ${second || third ? html`<div class="tt-row">${small(second, 2)}${small(third, 3)}</div>` : null}
  </div>`;
}

/** A player's face: the profile photo, or the first two letters of the nickname. */
export const Face = ({ name, photo, small }) => html`<span class=${cx("pf-avatar neutral", small && "mini")}>${photo ? html`<img class="photo" src=${photo} alt="" />` : (name || "?").slice(0, 2).toUpperCase()}</span>`;

const PRESENCE = { online: "в сети", in_match: "в игре", in_minigame: "в мини-игре", offline: "не в сети" };

/** A registered player's public card from the site, with friendship actions. */
function PlayerCard({ id, onChange }) {
  const [p, setP] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { playerProfile(id).then(setP).catch((e) => setErr(e.message)); }, [id]);
  if (err) return html`<div class="profile"><p class="hint-line">${err}</p></div>`;
  if (!p) return html`<div class="profile"><p class="hint-line">Загружаем…</p></div>`;
  const t = rankTier(p.rating ?? 0);
  const h = p.headToHead;
  const self = p.id === account.profile?.id;
  const act = async (action) => {
    setBusy(true); setErr(null);
    try { const r = await social.friend(p.id, action); setP({ ...p, relationship: r.relationship }); onChange?.(); vibrate(10); }
    catch (x) { setErr(x.message); }
    setBusy(false);
  };
  const rel = p.relationship;
  return html`<div class="profile">
    <div class="pf-head">
      <${Face} name=${p.nickname} photo=${p.avatar} />
      <span class="pf-name"><b>${p.nickname}</b><span>${flagOrGlobe(p.country) ? html`<i class="flag">${flagView(flagOrGlobe(p.country))}</i>` : null}<em class="lvl" style=${`--c:${levelColor(p.level)}`}>Ур. ${p.level}</em>
        ${p.presence ? html`<small>${PRESENCE[p.presence]}</small>` : null}</span></span>
      <span class="pf-rating">${p.rating != null ? html`<b class="grad" style=${`${tierStyle(p.rating)};filter:drop-shadow(0 0 6px ${t.b}80)`}>${p.rating}</b><small>${p.rank ? html`<${Place} n=${p.rank} />` : t.name}</small>`
        : html`<small>калибровка</small>`}</span>
    </div>
    <div class="pf-stats"><span><b>${p.games}</b><small>Игр</small></span><span><b>${p.winRate}%</b><small>Побед</small></span><span><b>${p.bestStreak}</b><small>Лучшая серия</small></span></div>
    ${h && h.games ? html`<div class="h2h"><div><small>Ваши встречи</small><span class="sp"></span><b>${h.wins} : ${h.losses}</b>${h.draws ? html`<em>ничьих ${h.draws}</em>` : null}</div></div>` : null}
    ${account.registered && !self ? html`<div class="pf-actions">
      ${rel === "none" ? html`<button class="green-btn press" disabled=${busy} onClick=${() => act("request")}><${Icon} name="friendAdd" size="17" />Добавить в друзья</button>`
        : rel === "incoming" ? html`<div class="two"><button class="green-btn press" disabled=${busy} onClick=${() => act("accept")}>Принять заявку</button><button class="navy-btn tall press" disabled=${busy} onClick=${() => act("decline")}>Отклонить</button></div>`
        : rel === "outgoing" ? html`<button class="navy-btn press" disabled=${busy} onClick=${() => act("cancel")}>Заявка отправлена · отменить</button>`
        : rel === "friends" ? html`<button class="navy-btn press" disabled=${busy} onClick=${() => act("remove")}>Удалить из друзей</button>`
        : rel === "blocked" ? html`<button class="navy-btn press" disabled=${busy} onClick=${() => act("unblock")}>Разблокировать</button>` : null}
    </div>` : null}
    ${err ? html`<p class="hint-line small pad" style="color:#FF9AA8">${err}</p>` : null}
  </div>`;
}

/** Friends from the site: requests to answer, the list with who is online, sent requests and a search by nickname. */
function Friends({ open }) {
  const [st, setSt] = useState(null);
  const [q, setQ] = useState("");
  const [found, setFound] = useState(null);
  const [err, setErr] = useState(null);
  // A failed look (the phone asleep, a moment without network) shows its error only until the next one works.
  const load = () => { if (document.hidden) return; social.state().then((v) => { setSt(v); setErr(null); }).catch((e) => setErr(e.message)); };
  // Calls change by the second (countdowns, answers): the shared poll keeps them fresh here too.
  const [calls, setCalls] = useState(invites.list);
  useEffect(() => { const off = invites.on(setCalls); const t = setInterval(() => setCalls(invites.list.filter((i) => i.expires > Date.now())), 1000); return () => { off(); clearInterval(t); }; }, []);
  useEffect(() => {
    load(); const t = setInterval(load, 30000);
    const back = () => { if (!document.hidden) load(); };
    document.addEventListener("visibilitychange", back);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", back); };
  }, []);
  useEffect(() => {
    const v = q.trim();
    if (v.length < 3) { setFound(null); return; }
    const t = setTimeout(() => social.search(v).then(setFound).catch((e) => setErr(e.message)), 350);
    return () => clearTimeout(t);
  }, [q]);
  const answer = async (id, action) => { try { await social.friend(id, action); vibrate(10); load(); } catch (x) { setErr(x.message); } };
  // A call to a game: the friend gets it in the app and as a push; accepting opens a closed room for the two.
  const call = async (id) => { setErr(null); try { await social.invite(id); vibrate(10); invites.refresh(); } catch (x) { setErr(x.message); } };
  const invitation = async (i, action) => { setErr(null); try { await takeInvite(i, action); } catch (x) { setErr(x.message); } invites.refresh(); };
  /** The friend's call, in the row instead of «Позвать»: invited with a countdown, then «Войти»; or theirs to accept. */
  const callSide = (p) => {
    const i = calls.find((x) => x.friend === p.id);
    // The match you have minimised with this friend in it: back to it, as from the bar over the menu.
    const cur = invites.current;
    if (!i && cur && ((p.watch && p.watch === cur.code) || cur.names.includes(p.nickname)))
      return html`<button class="chip-btn press go" onClick=${() => dispatchEvent(new CustomEvent("derbyo-return"))}>Вернуться</button>`;
    // A friend in a Контекстно room: «Войти» while it has a free seat, «Смотреть» from the stands when full.
    if (!i && p.presence === "in_minigame" && p.contexto) return html`<button class=${cx("chip-btn press", p.contexto.free && "go")} onClick=${() => dispatchEvent(new CustomEvent("derbyo-contexto", { detail: { code: p.contexto.code } }))}>
      ${p.contexto.free ? "Войти" : html`<img src=${img("eye")} alt="" />Смотреть`}</button>`;
    // A friend in a live game can be watched; while you play yourself, you cannot call anyone.
    if (!i && p.presence === "in_match") return p.watch ? html`<button class="chip-btn press" onClick=${() => dispatchEvent(new CustomEvent("derbyo-watch", { detail: p.watch }))}><img src=${img("eye")} alt="" />Смотреть</button>` : null;
    if (!i) return html`<button class="chip-btn press" disabled=${invites.busy} onClick=${() => call(p.id)}><img src=${img("invite")} alt="" />Позвать</button>`;
    if (i.status === "accepted") return html`<button class="chip-btn press go" onClick=${() => invitation(i, "go")}>Войти · ${secondsLeft(i)}</button>`;
    if (i.direction === "incoming") return html`<button class="chip-btn press go" onClick=${() => invitation(i, "go")}>Принять · ${secondsLeft(i)}</button>`;
    return html`<span class="chip-btn invited"><span class="spinner"></span>Приглашён · ${secondsLeft(i)}</span>`;
  };
  const row = (p, side) => html`<div class="fr-row">
    <button class="fr-who press" onClick=${() => open(p.id, load)}><${Face} name=${p.nickname} photo=${p.avatar} small=${true} />
      <span class="lb-name"><b>${flagOrGlobe(p.country) ? html`<i class="flag">${flagView(flagOrGlobe(p.country))}</i> ` : null}${p.nickname}</b>
        <small class=${cx(p.presence && "pres-" + p.presence)}>${p.presence ? PRESENCE[p.presence] : p.rating != null ? `рейтинг ${p.rating}` : `ур. ${p.level}`}</small></span></button>
    ${side}</div>`;
  if (!st) return html`<p class="hint-line pad">${err ?? "Загружаем друзей…"}</p>`;
  return html`
    <label class="pw-field"><${Icon} name="search" size="16" /><input value=${q} onInput=${(e) => setQ(e.target.value)} placeholder="Найти игрока по нику"
      autocapitalize="off" autocorrect="off" spellcheck="false" /></label>
    ${found ? html`<div class="board-list glass">${found.length ? found.map((p) => row(p,
        p.relationship === "none" ? html`<button class="chip-btn press" onClick=${async () => { await answer(p.id, "request"); setFound(found.map((x) => (x.id === p.id ? { ...x, relationship: "outgoing" } : x))); }}><${Icon} name="friendAdd" size="15" />Добавить</button>`
        : html`<small class="fr-note">${{ friends: "в друзьях", outgoing: "заявка отправлена", incoming: "ждёт ответа", blocked: "заблокирован" }[p.relationship] ?? ""}</small>`))
      : html`<p class="hint-line pad">Никого не нашли.</p>`}</div>` : null}
    ${st.incoming.length ? html`<h4 class="section">ЗАЯВКИ · ${st.incoming.length}</h4><div class="board-list glass">${st.incoming.map((p) => row(p, html`<span class="fr-btns">
      <button class="round-ok press" aria-label="Принять" onClick=${() => answer(p.id, "accept")}><${Icon} name="check" size="16" weight="2.5" /></button>
      <button class="round-no press" aria-label="Отклонить" onClick=${() => answer(p.id, "decline")}><${Icon} name="x" size="14" weight="2.5" /></button></span>`))}</div>` : null}
    <h4 class="section">ДРУЗЬЯ · ${st.friends.length}</h4>
    ${st.friends.length ? html`<div class="board-list glass">${st.friends.map((p) => row(p, callSide(p)))}</div>`
      : html`<p class="hint-line small pad">Пока никого. Найди друга по нику или открой профиль соперника после матча.</p>`}
    ${st.outgoing.length ? html`<h4 class="section">ОТПРАВЛЕННЫЕ</h4><div class="board-list glass">${st.outgoing.map((p) => row(p,
      html`<button class="text-btn muted" onClick=${() => answer(p.id, "cancel")}>Отменить</button>`))}</div>` : null}
    ${err ? html`<p class="hint-line small pad" style="color:#FF9AA8">${err}</p>` : null}`;
}

// The flag comes from the phone's time zone (the region of its language as a fallback); there is no country picker.
const ZONES = { KZ: ["Almaty", "Qostanay", "Aqtobe", "Aqtau", "Atyrau", "Oral", "Qyzylorda"], UZ: ["Tashkent", "Samarkand"], KG: ["Bishkek"], TJ: ["Dushanbe"],
  TM: ["Ashgabat"], AZ: ["Baku"], AM: ["Yerevan"], GE: ["Tbilisi"], BY: ["Minsk"], UA: ["Kyiv", "Kiev"], MD: ["Chisinau"], TR: ["Istanbul"],
  RU: ["Moscow", "Kaliningrad", "Samara", "Volgograd", "Saratov", "Ulyanovsk", "Astrakhan", "Kirov", "Yekaterinburg", "Omsk", "Novosibirsk", "Barnaul", "Tomsk",
    "Novokuznetsk", "Krasnoyarsk", "Irkutsk", "Chita", "Yakutsk", "Vladivostok", "Sakhalin", "Magadan", "Srednekolymsk", "Kamchatka", "Anadyr"] };
export function homeCountry() {
  try {
    const city = Intl.DateTimeFormat().resolvedOptions().timeZone?.split("/").pop();
    for (const [c, list] of Object.entries(ZONES)) if (list.includes(city)) return c;
  } catch {}
  const region = (navigator.language || "").split("-")[1]?.toUpperCase();
  return /^[A-Z]{2}$/.test(region ?? "") ? region : null;
}

/** «#12», a top-five place in its own colour. */
const Place = ({ n }) => html`<span class=${cx(placeStyle(n) && "grad")} style=${placeStyle(n)}>#${n}</span>`;

/** A square photo, cropped to the middle and shrunk until it fits the server's 48 KB. */
async function squarePhoto(file) {
  const url = URL.createObjectURL(file);
  try {
    const im = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error("Не удалось открыть фото.")); i.src = url; });
    for (const [size, q] of [[256, 0.82], [224, 0.72], [192, 0.62], [160, 0.55]]) {
      const c = document.createElement("canvas"); c.width = c.height = size;
      const side = Math.min(im.naturalWidth, im.naturalHeight);
      c.getContext("2d").drawImage(im, (im.naturalWidth - side) / 2, (im.naturalHeight - side) / 2, side, side, 0, 0, size, size);
      const data = c.toDataURL("image/jpeg", q);
      if ((data.length - 23) * 0.75 < 44 * 1024) return data;
    }
    throw new Error("Фото слишком большое.");
  } finally { URL.revokeObjectURL(url); }
}

/** The site's password change: the current one, then the new one twice. */
function ChangePassword({ done }) {
  const [f, setF] = useState({ currentPassword: "", password: "", confirmPassword: "" });
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const field = (k, ph, ac) => html`<label class="pw-field"><${Icon} name="lock" size="16" /><input type="password" value=${f[k]} placeholder=${ph} autocomplete=${ac}
    onInput=${(e) => setF({ ...f, [k]: e.target.value })} /></label>`;
  const save = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try { await account.send("password", f); vibrate(10); done(); } catch (x) { setErr(x.message); setBusy(false); }
  };
  return html`<form class="profile auth" onSubmit=${save}>
    <h3 class="sheet-title">Смена пароля</h3>
    ${field("currentPassword", "Текущий пароль", "current-password")}
    ${field("password", "Новый пароль · от 6 символов", "new-password")}
    ${field("confirmPassword", "Новый пароль ещё раз", "new-password")}
    ${err ? html`<p class="hint-line small pad" style="color:#FF9AA8">${err}</p>` : null}
    <button class="primary-btn" type="submit" disabled=${busy || !f.currentPassword || f.password.length < 6 || f.password !== f.confirmPassword}>${busy ? html`<span class="spinner"></span>` : "Сменить пароль"}</button>
    <p class="hint-line small pad">Другие устройства выйдут из аккаунта. Код восстановления остаётся прежним.</p>
  </form>`;
}

/** Sound and vibration, kept on this phone. */
function Settings() {
  const [, redraw] = useState(0);
  const row = (icon, title, detail, on, set) => html`<label class="toggle-card">
    <span class="tc-ic">${icon}</span>
    <span class="tc-t"><b>${title}</b><small>${detail}</small></span>
    <input type="checkbox" class="switch" checked=${on} onClick=${(e) => { set(e.target.checked); redraw((n) => n + 1); }} /></label>`;
  return html`<div class="settings-list">
    ${row(html`<img src=${img("sound")} alt="" />`, "Звук", "Ходы, таймер, победа", Sound.enabled, (v) => { Sound.enabled = v; if (v) Sound.play("turn"); })}
    ${row(html`<img src=${img("vibrate")} alt="" />`, "Вибрация", "Отклик на нажатия и ходы", Prefs.vibration, (v) => { Prefs.vibration = v; vibrate(15); })}
    ${account.profile && "showFlag" in account.profile ? html`<${NotifyRow} />` : null}
    <p class="app-build">Версия ${BUILD} · ${screenSizes()}</p>
  </div>`;
}

/** What the phone tells the app about its screen (layout height / visible height / screen height · bottom inset),
 * so a screenshot of the profile shows where a strip at the bottom comes from. */
function screenSizes() {
  let b = 0;
  try { const d = document.createElement("div"); d.style.cssText = "position:fixed;padding-bottom:env(safe-area-inset-bottom);visibility:hidden"; document.body.append(d); b = parseFloat(getComputedStyle(d).paddingBottom) || 0; d.remove(); } catch {}
  const vv = window.visualViewport;
  return `${innerHeight}/${Math.round(vv?.height ?? innerHeight)}/${screen.height} · ${Math.round(b)}${navigator.standalone ? " · app" : ""}`;
}

/** Notifications: one switch, and a pencil that picks which kinds come. */
function NotifyRow() {
  const [on, setOn] = useState(null);
  const [err, setErr] = useState(null);
  const [edit, setEdit] = useState(false);
  const [shut, setShut] = useState(false);
  const check = () => notifications.enabled().then(setOn).catch(() => setOn(false));
  useEffect(() => { check(); const off = notifications.onChange(check); const back = () => document.hidden || check();
    document.addEventListener("visibilitychange", back); return () => { off(); document.removeEventListener("visibilitychange", back); }; }, []);
  // Pushes belong to an account: a guest sees the row and how to get them.
  const guest = !account.profile?.registered;
  const supported = !guest && notifications.supported(), denied = notifications.permission() === "denied", prefs = notifications.prefs;
  const kinds = PUSH_KINDS.filter(([k]) => prefs[k]).map(([, t]) => t);
  const detail = guest ? "Появятся после регистрации" : !supported ? "Работают в приложении с экрана «Домой»" : denied ? "Запрещены: разреши их для DERBYO в настройках браузера или телефона"
    : on ? (kinds.length ? kinds.join(" · ") : "Все виды выключены") : "Приглашения в игру и заявки в друзья";
  const flip = async (v) => {
    setErr(null); setOn(v);
    try { if (v) await notifications.enable(); else await notifications.disable(); vibrate(10); } catch (e) { setErr(e.message); }
    check();
  };
  return html`<div class=${cx("toggle-card notify-row", guest && "off")} aria-disabled=${guest}>
      <span class="tc-ic"><img src=${img("bell")} alt="" /></span>
      <span class="tc-t"><b>Уведомления</b><small>${err ?? detail}</small></span>
      ${on ? html`<button class="pencil-btn press" aria-label="Выбрать уведомления" onClick=${() => { setShut(false); setEdit(true); }}><${Icon} name="pencil" size="16" weight="2" /></button>` : null}
      ${guest ? html`<input type="checkbox" class="switch" aria-label="Уведомления" checked=${false} disabled />`
        : supported && !denied ? html`<input type="checkbox" class="switch" aria-label="Уведомления" checked=${!!on} disabled=${on === null} onClick=${(e) => flip(e.target.checked)} />` : null}
    </div>
    ${edit ? html`<${Panel} shut=${shut} onClose=${() => setEdit(false)}><${NotifyKinds} /><//>` : null}`;
}

function NotifyKinds() {
  const [p, setP] = useState(notifications.prefs);
  const [err, setErr] = useState(null);
  const set = (k, v) => { const n = { ...p, [k]: v }; setP(n); notifications.setPrefs(n).catch((e) => setErr(e.message)); };
  return html`<div class="profile notify-kinds">
    <h3 class="sheet-title">Уведомления</h3>
    <div class="settings-list">${PUSH_KINDS.map(([k, t, d]) => html`<label class="toggle-card">
      <span class="tc-t"><b>${t}</b><small>${d}</small></span>
      <input type="checkbox" class="switch" checked=${p[k]} onClick=${(e) => set(k, e.target.checked)} /></label>`)}</div>
    ${err ? html`<p class="hint-line small pad" style="color:#FF9AA8">${err}</p>` : null}
  </div>`;
}

/** Your account: a guest name, or the site's login and registration; then your numbers, friends and settings. */
export function ProfileTab({ children }) {
  const p = account.profile;
  const [mode, setMode] = useState(null);
  const [nick, setNick] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [recovery, setRecovery] = useState(null);
  const [guest, setGuest] = useState(account.name);
  const [sheet, setSheet] = useState(null);
  const [shut, setShut] = useState(false);
  const [friendsKey, setFriendsKey] = useState(0);
  const openSheet = (s) => { setShut(false); setSheet(s); };
  const file = useRef();
  // The plus on the photo opens the phone's gallery; the chosen photo is cropped and saved at once.
  const pickPhoto = async (e) => {
    const f = e.target.files?.[0]; e.target.value = "";
    if (!f) return;
    setBusy(true); setErr(null);
    try { await account.send("profile", { avatar: await squarePhoto(f) }); vibrate(10); } catch (x) { setErr(x.message); }
    setBusy(false);
  };
  const saveFlag = (v) => account.send("profile", v ? { showFlag: true, ...(p.country ? {} : { country: homeCountry() }) } : { showFlag: false })
    .then(() => vibrate(10)).catch((x) => setErr(x.message));
  const dropPhoto = async () => { setBusy(true); try { await account.send("profile", { avatar: null }); } catch (x) { setErr(x.message); } setBusy(false); };
  // A new account's flag: the country is taken from the phone once, while the flag is on.
  useEffect(() => {
    if (p?.registered && p.showFlag && !p.country && homeCountry()) account.send("profile", { country: homeCountry() }).catch(() => {});
  }, [p?.id, p?.showFlag]);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const r = await account.send(mode, { nickname: nick.trim(), password: pw });
      if (r.recovery) setRecovery(r.recovery);
      setMode(null); setPw("");
    } catch (x) { setErr(x.message); }
    setBusy(false);
  };
  const logout = async () => { setBusy(true); try { await notifications.forget(); await account.send("logout", {}); } catch (x) { setErr(x.message); } setBusy(false); };
  if (!account.ready) return html`<div class="screen-scroll"><div class="page"><h1 class="big-title">Профиль</h1><p class="hint-line pad">Соединяемся с derbyo.online…</p>${children}</div></div>`;
  const t = rankTier(p.rating ?? 0);
  const editable = p.registered && "avatar" in p;
  return html`<div class="screen-scroll"><div class="page">
    <h1 class="big-title">Профиль</h1>
    <div class="profile glass account-card">
      <div class="pf-head">
        ${editable ? html`<button class="face-btn press" disabled=${busy} aria-label=${p.avatar ? "Сменить фото" : "Добавить фото"} onClick=${() => (p.avatar ? openSheet({ kind: "photo" }) : file.current.click())}><${Face} name=${account.name} photo=${p.avatar} /><span class="face-edit"><${Icon} name="camera" size="15" /></span></button>
          <input ref=${file} type="file" accept="image/*" hidden onChange=${pickPhoto} />`
          : html`<${Face} name=${account.name} photo=${p.avatar} />`}
        <span class="pf-name"><b>${account.name}</b><span>${p.showFlag === false ? html`<i class="flag">${flagView("🌐")}</i>` : flagOrGlobe(p.country) ? html`<i class="flag">${flagView(flagOrGlobe(p.country))}</i>` : null}<em class="lvl" style=${`--c:${levelColor(p.level)}`}>Ур. ${p.level}</em>${p.registered ? null : html`<small>гость</small>`}</span></span>
        <span class="pf-rating">${p.rating != null ? html`<b class="grad" style=${`${tierStyle(p.rating)};filter:drop-shadow(0 0 6px ${t.b}80)`}>${p.rating}</b>
          <small>${p.rank ? html`<${Place} n=${p.rank} />` : t.name}</small>`
          : html`<small>${p.registered ? "рейтинг после 5 игр с 2 соперниками" : "рейтинг — после входа"}</small>`}</span>
      </div>
      <div class="pf-stats"><span><b>${p.games}</b><small>Игр</small></span><span><b>${p.games ? Math.round((p.wins / p.games) * 100) : 0}%</b><small>Побед</small></span><span><b>${p.bestStreak}</b><small>Лучшая серия</small></span></div>
      ${p.registered ? html`<div class="pf-stats small"><span><b>${p.wins}</b><small>Выиграно</small></span><span><b>${p.draws ?? 0}</b><small>Вничью</small></span><span><b>${p.losses ?? 0}</b><small>Проиграно</small></span></div>` : null}
      ${editable && "showFlag" in p ? html`<label class="flag-row">
        <i class="flag">${flagView(p.showFlag ? flagOf(p.country ?? homeCountry()) ?? "🌐" : "🌐")}</i>
        <span><b>Мой флаг</b><small>${p.showFlag ? "Другие игроки видят флаг твоей страны" : "Другие видят планету вместо флага"}</small></span>
        <input type="checkbox" class="switch" checked=${p.showFlag} onClick=${(e) => saveFlag(e.target.checked)} /></label>` : null}
    </div>
    ${recovery ? html`<div class="info-card"><div class="ic-title"><${Icon} name="lock" size="15" style="color:#F6D482" /><b>Код восстановления</b></div>
      <p>Сохрани его: только он вернёт аккаунт, если забудешь пароль. Больше он не покажется.</p>
      <b class="recovery">${recovery}</b><button class="navy-btn small" onClick=${() => setRecovery(null)}>Сохранил</button></div>` : null}
    ${p.registered ? html`<${Friends} key=${friendsKey} open=${(id) => openSheet({ kind: "player", id })} />`
      : mode ? html`<form class="auth" onSubmit=${submit}>
          <h4 class="section">${mode === "login" ? "ВХОД" : "РЕГИСТРАЦИЯ"}</h4>
          <label class="pw-field"><${Icon} name="profile" size="16" /><input value=${nick} maxlength=${mode === "register" ? 16 : 20} onInput=${(e) => setNick(e.target.value)} placeholder="Ник" autocomplete="username" autocapitalize="off" autocorrect="off" spellcheck="false" /></label>
          <label class="pw-field"><${Icon} name="lock" size="16" /><input type="password" value=${pw} onInput=${(e) => setPw(e.target.value)} placeholder="Пароль" autocomplete=${mode === "login" ? "current-password" : "new-password"} /></label>
          ${mode === "register" ? html`<p class="hint-line small pad">Ник — 3–16 латинских букв, цифр, «_» или «-». Пароль от 6 символов. Твои игры гостем останутся в аккаунте.</p>` : null}
          ${err ? html`<p class="hint-line small pad" style="color:#FF9AA8">${err}</p>` : null}
          <button class="primary-btn" type="submit" disabled=${busy || nick.trim().length < 3 || pw.length < 6}>${busy ? html`<span class="spinner"></span>` : mode === "login" ? "Войти" : "Создать аккаунт"}</button>
          <button class="text-btn muted" type="button" onClick=${() => { setMode(null); setErr(null); }}>Отмена</button>
        </form>`
      : html`<div class="two"><button class="primary-btn" onClick=${() => setMode("login")}>Войти</button><button class="navy-btn tall" onClick=${() => setMode("register")}>Регистрация</button></div>
        <p class="hint-line small pad">Тот же аккаунт, что на derbyo.online: рейтинг, уровень и друзья общие. Друзья и фото профиля — после входа.</p>
        <h4 class="section">ИМЯ ГОСТЯ</h4>
        <label class="pw-field"><input value=${guest} minlength="3" maxlength="16" onInput=${(e) => setGuest(e.target.value)} onBlur=${() => { const v = guest.trim(); if (v.length >= 3) account.guestName = v; else setGuest(account.name); }} /></label>`}
    <h4 class="section">НАСТРОЙКИ</h4>
    <${Settings} />
    ${p.registered ? html`<div class="settings-list">
      <button class="toggle-card press" onClick=${() => openSheet({ kind: "password" })}><span class="tc-ic"><img src=${img("key")} alt="" /></span>
        <span class="tc-t"><b>Сменить пароль</b><small>Нужен текущий пароль</small></span><${Icon} name="right" size="14" style="opacity:.4" /></button>
      <button class="navy-btn" disabled=${busy} onClick=${logout}>Выйти из аккаунта</button></div>` : null}
    ${err && !mode ? html`<p class="hint-line small pad" style="color:#FF9AA8">${err}</p>` : null}
    ${children}
  </div>
  ${sheet ? html`<${Panel} shut=${shut} onClose=${() => setSheet(null)}>
    ${sheet.kind === "password" ? html`<${ChangePassword} done=${() => setShut(true)} />`
      : sheet.kind === "photo" ? html`<div class="profile photo-sheet">
          <h3 class="sheet-title">Фото профиля</h3>
          <button class="primary-btn" onClick=${() => { file.current.click(); setShut(true); }}><${Icon} name="camera" size="18" />Выбрать новое фото</button>
          <button class="navy-btn tall danger" disabled=${busy} onClick=${() => { dropPhoto(); setShut(true); }}>Убрать фото</button></div>`
      : html`<${PlayerCard} id=${sheet.id} onChange=${() => setFriendsKey((k) => k + 1)} />`}<//>` : null}
  </div>`;
}

/** Opens a friend's invitation: accepting (or the sender, once accepted) gets a seat; the app opens that room. */
export async function takeInvite(i, action = "go") {
  if (action !== "go") { await social.invitation(i.id, action); return; }
  const r = await social.invitation(i.id, i.direction === "incoming" && i.status !== "accepted" ? "accept" : "claim");
  invites.taken(i.id);
  if (r.session) dispatchEvent(new CustomEvent("derbyo-session", { detail: r.session }));
  if (r.contexto) dispatchEvent(new CustomEvent("derbyo-contexto", { detail: { code: r.contexto } }));
  if (r.room) dispatchEvent(new CustomEvent("derbyo-join-room", { detail: r.room }));
}
