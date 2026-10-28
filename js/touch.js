// Making a web page behave like the app on a phone: press states, no zoom, and the keyboard's visible area.

// iOS Safari only applies :active while a touch listener exists; without it no button reacts to a press.
document.addEventListener("touchstart", () => {}, { passive: true });

// The page does not zoom on a pinch (Safari ignores user-scalable=no); double tap is off in app.css.
for (const t of ["gesturestart", "gesturechange"]) document.addEventListener(t, (e) => e.preventDefault());

/** The part of the screen the keyboard leaves free, as --vv-top and --vv-h: panels sit inside it.
 * iOS keeps the layout size when the keyboard opens and may scroll the page under it. */
const root = document.documentElement;
const vv = window.visualViewport;
function fit() {
  const h = vv ? vv.height : innerHeight, top = vv ? vv.offsetTop : 0;
  root.style.setProperty("--vv-top", `${Math.round(top)}px`);
  root.style.setProperty("--vv-h", `${Math.round(h)}px`);
  root.classList.toggle("kb-open", innerHeight - h - top > 60);
}
vv?.addEventListener("resize", fit);
vv?.addEventListener("scroll", fit);
addEventListener("resize", fit);
fit();
// When the keyboard goes, iOS can leave the page scrolled; put it back.
document.addEventListener("focusout", () => setTimeout(() => {
  if (!document.activeElement?.matches?.("input, textarea") && (scrollX || scrollY)) scrollTo(0, 0);
}, 60));
