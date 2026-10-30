// The offer to put DERBYO on the home screen, on the first visit in a browser.
import { html, useState, useEffect, cx, img, Icon } from "./ui/common.js";
import { notifications } from "./push.js";

let deferred = null;
addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e; });

export const isStandalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
export const isIOS = () => /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

export const installState = {
  /** Offered once: until the player installs or chooses to stay in the browser. */
  shouldOffer() {
    if (isStandalone()) return false;
    try { return localStorage.getItem("install-choice") === null; } catch { return true; }
  },
  remember(choice) { try { localStorage.setItem("install-choice", choice); } catch {} },
};

export function InstallSheet({ close }) {
  const [steps, setSteps] = useState(false);
  const [out, setOut] = useState(false);
  const leave = (choice) => { if (choice) installState.remember(choice); setOut(true); setTimeout(close, 250); };
  const install = async () => {
    if (deferred) {
      deferred.prompt();
      const r = await deferred.userChoice.catch(() => null);
      deferred = null;
      leave(r?.outcome === "accepted" ? "installed" : null);
      return;
    }
    setSteps(true);
  };
  const ios = isIOS();
  return html`<div class=${cx("overlay install", out && "out")}>
    <div class="dim" onClick=${() => leave(null)}></div>
    <div class="panel install-panel" role="dialog" aria-label="Установить DERBYO">
      <div class="grip-row"><span class="grip"></span></div>
      <div class="inst">
        <div class="inst-head">
          <img class="inst-icon" src=${img("app-icon")} alt="" />
          <span><b>DERBYO на экран «Домой»</b><small>Как приложение: на весь экран, без панелей браузера, запуск с иконки.</small></span>
        </div>
        ${steps ? html`<ol class="inst-steps">
          ${ios ? html`
            <li><span class="n">1</span><span>Нажми <b>«Поделиться»</b> <i class="share-ic"><${Icon} name="share" size="15" /></i> в панели Safari${" "}<small>(внизу или вверху экрана; в Chrome — справа от адреса)</small></span></li>
            <li><span class="n">2</span><span>Пролистай и выбери <b>«На экран „Домой“»</b> <i class="share-ic"><${Icon} name="plusSquare" size="15" /></i></span></li>
            <li><span class="n">3</span><span>Нажми <b>«Добавить»</b> — иконка DERBYO появится на экране</span></li>`
          : html`
            <li><span class="n">1</span><span>Открой меню браузера <b>⋮</b></span></li>
            <li><span class="n">2</span><span>Выбери <b>«Установить приложение»</b> или <b>«Добавить на главный экран»</b></span></li>`}
        </ol>
        <button class="primary-btn" onClick=${() => leave("steps")}>Понятно</button>`
        : html`<button class="primary-btn" onClick=${install}><img src=${img("bolt")} alt="" />Установить</button>
          <button class="navy-btn tall" onClick=${() => leave("browser")}>Остаться в браузере</button>`}
      </div>
    </div>
  </div>`;
}

/** In the profile tab: install later, if the player chose the browser at first. */
export function InstallRow({ open }) {
  if (isStandalone()) return html`<p class="hint-line small center">Установлено как приложение ✓</p>`;
  return html`<button class="mode press" onClick=${open}>
    <span class="mode-ic"><img src=${img("app-icon")} alt="" style="border-radius:9px" /></span>
    <span class="mode-t"><b>Установить на экран «Домой»</b><small>На весь экран, без панелей браузера</small></span>
    <${Icon} name="right" size="13" weight="3" class="chev" /></button>`;
}

/** Once, in the app opened from the home screen: notifications for friends' invites. */
export function PushAskSheet({ close }) {
  const [out, setOut] = useState(false);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const leave = () => { notifications.asked(); setOut(true); setTimeout(close, 250); };
  // Subscribing takes a few seconds on iPhone: the button spins meanwhile; a refusal closes, a failure says why.
  const enable = async () => {
    if (busy) return;
    setBusy(true); setErr(null);
    try { await notifications.enable(); leave(); }
    catch (e) { if (notifications.permission() === "denied") leave(); else { setErr(e.message); setBusy(false); } }
  };
  return html`<div class=${cx("overlay install", out && "out")}>
    <div class="dim" onClick=${() => busy || leave()}></div>
    <div class="panel install-panel" role="dialog" aria-label="Уведомления">
      <div class="grip-row"><span class="grip"></span></div>
      <div class="inst">
        <div class="inst-head">
          <img class="inst-icon bell" src=${img("bell")} alt="" />
          <span><b>Включить уведомления?</b><small>Узнаешь сразу, когда друг зовёт сыграть или добавляет в друзья.</small></span>
        </div>
        ${err ? html`<p class="hint-line small pad" style="color:#FF9AA8">${err}</p>` : null}
        <button class="primary-btn" disabled=${busy} onClick=${enable}>${busy ? html`<span class="spinner"></span>Включаем…` : html`<img src=${img("bell")} alt="" />Включить`}</button>
        <button class="navy-btn tall" disabled=${busy} onClick=${leave}>Не сейчас</button>
      </div>
    </div>
  </div>`;
}
