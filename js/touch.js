// Making a web page behave like the app on a phone: press states, no zoom, and the keyboard's visible area.

// iOS Safari only applies :active while a touch listener exists; without it no button reacts to a press.
document.addEventListener("touchstart", () => {}, { passive: true });

// Focus rings only for the keyboard: a tapped card must not stay framed after a panel closes.
addEventListener("keydown", (e) => { if (e.key === "Tab") document.documentElement.classList.add("kbd"); }, true);
addEventListener("pointerdown", () => document.documentElement.classList.remove("kbd"), true);

// The page does not zoom on a pinch (Safari ignores user-scalable=no); double tap is off in app.css.
for (const t of ["gesturestart", "gesturechange"]) document.addEventListener(t, (e) => e.preventDefault());

/** The part of the screen the keyboard leaves free, as --vv-top and --vv-h: panels sit inside it.
 * iOS keeps the layout size when the keyboard opens and may scroll the page under it. */
const root = document.documentElement;
const vv = window.visualViewport;
// iOS 26 home-screen apps report a page shorter than the screen by the status bar (793 of 852 on an iPhone 15)
// and leave that strip empty at the bottom: the tab bar floats high. Stretch the app to the whole screen there.
const standalone = navigator.standalone === true;
function fit() {
  const h = vv ? vv.height : innerHeight, top = vv ? vv.offsetTop : 0;
  const kb = innerHeight - h - top > 60;
  const full = standalone && innerWidth < innerHeight ? Math.max(screen.width, screen.height) : 0;
  const gap = full - innerHeight > 20 && full - innerHeight < 120 ? full : 0;
  root.classList.toggle("ios-gap", !!gap);
  if (gap) root.style.setProperty("--app-h", `${gap}px`);
  root.style.setProperty("--vv-top", `${Math.round(top)}px`);
  root.style.setProperty("--vv-h", `${Math.round(gap && !kb ? gap : h)}px`);
  root.classList.toggle("kb-open", kb);
}
vv?.addEventListener("resize", fit);
vv?.addEventListener("scroll", fit);
addEventListener("resize", fit);
fit();
// When the keyboard goes, iOS can leave the page scrolled; put it back.
document.addEventListener("focusout", () => setTimeout(() => {
  if (!document.activeElement?.matches?.("input, textarea") && (scrollX || scrollY)) scrollTo(0, 0);
}, 60));
