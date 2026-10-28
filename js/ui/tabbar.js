// The iOS 26 tab bar: a floating glass capsule with a bubble under the open tab. The bubble swells under the
// finger, can be dragged along the bar and springs to the tab it is let go over.
import { html, useState, useEffect, useRef, cx, img } from "./common.js";

export function TabBar({ tab, pick, items }) {
  const bar = useRef(), bubble = useRef();
  const [held, setHeld] = useState(false);
  const [hover, setHover] = useState(null);
  const g = useRef(null);
  const prev = useRef(tab);
  const n = items.length;

  const slot = () => { const r = bar.current.getBoundingClientRect(); return { r, w: (r.width - 8) / n }; };
  const indexAt = (x) => { const { r, w } = slot(); return Math.max(0, Math.min(n - 1, Math.floor((x - r.left - 4) / w))); };
  const place = (x, animate) => {
    const b = bubble.current;
    b.style.transition = animate ? "" : "none";
    b.style.transform = x === null ? "" : `translate3d(${x}px,0,0)`;
  };

  // A tab change the bar did not drag: the bubble travels and stretches on the way, like liquid.
  useEffect(() => {
    if (prev.current === tab) return;
    const d = Math.sign(tab - prev.current);
    prev.current = tab;
    bubble.current?.firstChild?.animate([{ transform: "scale(1,1)" }, { transform: `scale(1.22,.86) translateX(${d * 2}px)`, offset: 0.35 }, { transform: "scale(1,1)" }],
      { duration: 520, easing: "cubic-bezier(.3,1.25,.5,1)" });
  }, [tab]);

  const down = (e) => {
    if (e.button > 0) return;
    bar.current.setPointerCapture?.(e.pointerId);
    const { r, w } = slot();
    g.current = { x0: e.clientX, moved: false, r, w };
    setHeld(true);
    setHover(indexAt(e.clientX));
  };
  const move = (e) => {
    const s = g.current;
    if (!s) return;
    if (!s.moved && Math.abs(e.clientX - s.x0) < 8) return;
    s.moved = true;
    const x = Math.max(0, Math.min(s.r.width - 8 - s.w, e.clientX - s.r.left - 4 - s.w / 2));
    place(x, false);
    setHover(indexAt(e.clientX));
  };
  const up = (e) => {
    const s = g.current;
    if (!s) return;
    g.current = null;
    setHeld(false); setHover(null);
    const i = indexAt(e.clientX);
    place(null, true);
    if (s.moved) prev.current = i;
    pick(i);
  };
  const cancel = () => { if (!g.current) return; g.current = null; setHeld(false); setHover(null); place(null, true); };

  return html`<nav class=${cx("tabbar", held && "held")} ref=${bar} style=${`--n:${n};--i:${tab}`}
    onPointerDown=${down} onPointerMove=${move} onPointerUp=${up} onPointerCancel=${cancel} onLostPointerCapture=${cancel}>
    <span class="tb-bubble" ref=${bubble} aria-hidden="true"><i></i></span>
    ${items.map(([t, icon, badge], i) => html`
      <button class=${cx("tab", tab === i && "on", hover === i && "hover")} aria-current=${tab === i ? "page" : null} aria-label=${t}
        onClick=${(e) => { if (e.detail === 0) pick(i); }}>
        <span class="tab-ic"><img src=${img(icon)} alt="" />${badge ? html`<b class="badge">${badge}</b>` : null}</span><span class="tab-t">${t}</span>
      </button>`)}
  </nav>`;
}
