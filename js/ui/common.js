// Shared pieces (Theme.swift and the small views the screens share).
import { html, useState, useEffect, useRef } from "../../vendor/preact-htm.js";

export { html, useState, useEffect, useRef };

export const cx = (...a) => a.filter(Boolean).join(" ");
export const img = (n) => `img/${n}.png`;

/** Stand-ins for the SF Symbols the app uses: 24-unit line icons. */
const paths = {
  x: "M6 6l12 12M18 6L6 18",
  left: "M15 5l-7 7 7 7",
  right: "M9 5l7 7-7 7",
  down: "M6 9l6 6 6-6",
  up: "M12 19V5M5 12l7-7 7 7",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4",
  check: "M5 12.5l4.5 4.5L19 7",
  share: "M12 3v12M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6",
  copy: "M9 9h10v12H9zM5 15V3h10",
  paste: "M9 4h6v3H9zM7 5H5v16h14V5h-2",
  sparkles: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z",
  phone: "M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM11 18h2",
  friendAdd: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-1a6 6 0 0 1 6-6h2a6 6 0 0 1 6 6v1M19 8v6M16 11h6",
  friends: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-1a6 6 0 0 1 6-6h2a6 6 0 0 1 6 6v1M16 3.5a4 4 0 0 1 0 7M18 14a6 6 0 0 1 4 6v1",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2",
  hand: "M7 11V6a1.5 1.5 0 0 1 3 0v5M10 10V4.5a1.5 1.5 0 0 1 3 0V10M13 10V5.5a1.5 1.5 0 0 1 3 0V12M16 9a1.5 1.5 0 0 1 3 0v5a7 7 0 0 1-7 7h-1a6 6 0 0 1-5-3l-2.5-4.5a1.5 1.5 0 0 1 2.5-1.5L7 14",
  ball: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7l4 3-1.5 4.5h-5L8 10zM12 7V3M16 10l4-1M14.5 14.5l2.5 3.5M9.5 14.5L7 18M8 10L4 9",
  timer: "M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM12 9v4M10 2h4",
  question: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-1a6 6 0 0 1 6-6h2M17 14.5a2.5 2.5 0 1 1 3 2.4V18M20 21v.01",
  home: "M4 11l8-7 8 7M6 10v10h12V10",
  plusSquare: "M12 8v8M8 12h8M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z",
  bubble: "M4 5h16v11H9l-5 4z",
  vibrate: "M9 3h6a1.5 1.5 0 0 1 1.5 1.5v15A1.5 1.5 0 0 1 15 21H9a1.5 1.5 0 0 1-1.5-1.5v-15A1.5 1.5 0 0 1 9 3zM4 8v8M20 8v8M1.5 10v4M22.5 10v4",
  profile: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1",
};
const solid = {
  eye: "M12 5C6.5 5 2.7 9.3 1.5 12c1.2 2.7 5 7 10.5 7s9.3-4.3 10.5-7C21.3 9.3 17.5 5 12 5zm0 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm0-2.2a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6z",
  lock: "M7 10V7a5 5 0 0 1 10 0v3h1a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2zm2 0h6V7a3 3 0 0 0-6 0z",
  pause: "M7 4h3.5v16H7zM13.5 4H17v16h-3.5z",
  play: "M7 4l13 8-13 8z",
};
export function Icon({ name, size = 16, weight = 2.4, class: c, style }) {
  const s = solid[name];
  return html`<svg class=${cx("ic", c)} style=${style} width=${size} height=${size} viewBox="0 0 24 24" aria-hidden="true"
    fill=${s ? "currentColor" : "none"} stroke=${s ? "none" : "currentColor"} stroke-width=${weight} stroke-linecap="round" stroke-linejoin="round"><path d=${s ?? paths[name]} /></svg>`;
}

/** Rating ranks, coloured like rarity in games; the colour goes on the rating number wherever it shows. */
export function rankTier(r) {
  if (r < 1000) return { name: "Бронза", a: "#F3C29B", b: "#B9773F", glow: 0.3 };
  if (r < 1300) return { name: "Серебро", a: "#F1F5FA", b: "#A9B8C9", glow: 0.3 };
  if (r < 1600) return { name: "Золото", a: "#FFF1C2", b: "#F2C14E", glow: 0.5 };
  if (r < 1900) return { name: "Изумруд", a: "#C7FFEC", b: "#3FD9A6", glow: 0.5 };
  if (r < 2200) return { name: "Алмаз", a: "#D9ECFF", b: "#6FA8FF", glow: 0.55 };
  return { name: "Легенда", a: "#EBDDFF", b: "#B07CFF", glow: 0.8 };
}
export const tierStyle = (r) => { const t = rankTier(r); return `background-image:linear-gradient(${t.a},${t.b})`; };
/** The first five places of the table get their own colour on the place number. */
export function placeStyle(place) {
  const g = { 1: "#FFF3A0,#FFA23D,#FF4D3D", 2: "#FFD3EC,#FF6FB5,#B36BFF", 3: "#D6FBFF,#5FD8FF,#3D7BFF", 4: "#F0FFC8,#A8F05A,#2FC36B", 5: "#FFFFFF,#D9E3EE,#9AAABD" }[place];
  return g ? `background-image:linear-gradient(${g})` : null;
}
export const levelColor = (l) => (l < 10 ? "#A8B8CA" : l < 25 ? "#DDE6F0" : l < 50 ? "#F6D482" : "#C6A2FF");

/** Rating in its rank colour, then «(#place)», a top-five place in its own colour. */
export function RatingTag({ flag, rating, rank, flagAfter = false, small = 9 }) {
  if (rating == null) return html`<span class="rating-tag">${flag ? html`<span class="flag">${flag}</span>` : null}</span>`;
  const ps = rank ? placeStyle(rank) : null;
  return html`<span class="rating-tag">
    ${flag && !flagAfter ? html`<span class="flag">${flag}</span>` : null}
    <b class="grad num" style=${tierStyle(rating)}>${rating}</b>
    ${rank ? html`<span class="place" style=${`font-size:${small}px`}>(#<span class=${cx(ps && "grad", rank <= 5 && "top")} style=${ps}>${rank}</span>)</span>` : null}
    ${flag && flagAfter ? html`<span class="flag">${flag}</span>` : null}
  </span>`;
}

/** The selection mark: a rounded square for multi-select, a circle for single choice. */
export const PickMark = ({ on, round = false, size = 24 }) =>
  html`<span class=${cx("pickmark", on && "on", round && "round")} style=${`--s:${size}px`} aria-hidden="true"><${Icon} name="check" size=${size * 0.55} weight="3.4" /></span>`;

export const CloseButton = ({ onClick }) =>
  html`<button class="close-btn press" onClick=${onClick} aria-label="Закрыть"><${Icon} name="x" size="15" weight="2.8" /></button>`;

/** Nicknames like damir_andromeda may wrap after "_", "-" or ".". */
export const breakable = (n) => n.replaceAll("_", "_​").replaceAll("-", "-​").replaceAll(".", ".​");

/** A panel that slides up from the bottom edge: a dim layer behind it closes it, so does a downward drag
 * (a quick flick or past a third of its height). It sits in the part of the screen the keyboard leaves free. */
export function Panel({ onClose, closable = true, shut = false, children, class: c }) {
  const [out, setOut] = useState(false);
  const panel = useRef(), dim = useRef();
  const g = useRef(null);
  const gone = useRef(false);
  const leave = (force) => {
    if ((!closable && force !== true) || gone.current) return;
    gone.current = true;
    if (panel.current?.contains(document.activeElement)) document.activeElement.blur();
    setOut(true); setTimeout(onClose, 250);
  };
  // `shut`: the screen closes it (the turn passed, a decision came), and it still slides away.
  useEffect(() => { if (shut) leave(true); }, [shut]);
  const set = (y, settle) => {
    const el = panel.current;
    el.classList.toggle("settle", settle);
    el.style.transform = y ? `translate3d(0,${y}px,0)` : "";
    if (dim.current) dim.current.style.opacity = y ? String(Math.max(0, 1 - y / el.offsetHeight)) : "";
  };
  const down = (e) => { if (!closable || e.target.closest("button")) return; e.currentTarget.setPointerCapture?.(e.pointerId); g.current = { y: e.clientY, dy: 0, v: 0, t: e.timeStamp }; };
  const move = (e) => {
    const s = g.current;
    if (!s) return;
    const dy = e.clientY - s.y;
    // Upwards it gives a little, like a rubber band.
    const y = dy > 0 ? dy : -Math.sqrt(-dy) * 2;
    s.v = (dy - s.dy) / Math.max(1, e.timeStamp - s.t); s.dy = dy; s.t = e.timeStamp;
    set(y, false);
  };
  const up = () => {
    const s = g.current;
    if (!s) return;
    g.current = null;
    if (s.dy > panel.current.offsetHeight / 3 || (s.v > 0.5 && s.dy > 30)) { panel.current.style.transform = ""; leave(); }
    else set(0, true);
  };
  return html`<div class=${cx("overlay", out && "out")} onKeyDown=${(e) => e.key === "Escape" && leave()}>
    <div class="dim" ref=${dim} onClick=${leave}></div>
    <div class=${cx("panel", c)} role="dialog" ref=${panel}>
      <div class="grip-row" onPointerDown=${down} onPointerMove=${move} onPointerUp=${up} onPointerCancel=${up}>
        <span class="grip"></span>
        ${closable ? html`<${CloseButton} onClick=${leave} />` : null}
      </div>
      ${typeof children === "function" ? children(leave) : children}
    </div>
  </div>`;
}

/** Keeps a panel on screen while it slides away after `open` turns false: [mounted, shut, gone]. */
export function useSheet(open) {
  const [shown, setShown] = useState(open);
  useEffect(() => { if (open) setShown(true); }, [open]);
  return [open || shown, !open, () => setShown(false)];
}

/** A fixed bar at the bottom of a scrolling screen, on a solid backing that fades in at its top edge. */
export const BottomBar = ({ children }) => html`<div class="bottom-bar">${children}</div>`;

export const LobbyHeader = ({ title, back }) => html`<div class="lobby-header">
  <button class="back-btn glass press" onClick=${back} aria-label="Назад"><${Icon} name="left" size="16" weight="2.8" /></button>
  <h1>${title}</h1>
</div>`;

/** A sheet for alerts and confirmations, in place of the system alert: it pops in, and fades before its action runs
 * (`stay` actions run at once and may keep it open). */
export function Alert({ title, message, actions, onClose, children }) {
  const [out, setOut] = useState(false);
  const after = (f) => () => { if (out) return; setOut(true); setTimeout(() => f?.(), 170); };
  return html`<div class=${cx("alert-wrap", out && "out")} onClick=${(e) => e.target === e.currentTarget && onClose && after(onClose)()}>
    <div class="alert" role="alertdialog">
      <h3>${title}</h3>
      ${message ? html`<p>${message}</p>` : null}
      ${children}
      <div class="alert-actions">
        ${actions.map((a) => html`<button class=${cx("alert-btn", a.kind)} onClick=${a.stay ? a.run : after(a.run)}>${a.title}</button>`)}
      </div>
    </div>
  </div>`;
}

export function Toast({ toast }) {
  return html`<div class=${cx("toast", toast.good ? "good" : "bad")} key=${toast.id}>${toast.text}</div>`;
}

/** Choices kept on this phone. */
export const Prefs = {
  get vibration() { try { return localStorage.getItem("derbyo-vibration") !== "0"; } catch { return true; } },
  set vibration(v) { try { localStorage.setItem("derbyo-vibration", v ? "1" : "0"); } catch {} },
};
export const vibrate = (ms) => { if (!Prefs.vibration) return; try { navigator.vibrate?.(ms); } catch {} };
