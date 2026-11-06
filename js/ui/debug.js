// Sandbox test room: the engineering menu. The other seat is a puppet the server treats as a person; these buttons
// make it (and the clock) do what is hard to catch in a real match. Shown only when the state carries `debug`.
import { html, useState, cx } from "./common.js";
import { store } from "../model.js";

const NOTICES = [["away", "Свернул"], ["offline", "Связь"], ["idle", "Бездействие"], ["ready", "Готовность"], ["stopped", "Остановлен"]];

export function DebugTools({ m }) {
  const [open, setOpen] = useState(false);
  const d = m.state?.debug;
  if (!d) return null;
  const run = (op, extra = {}, note = "") => m.act("debug", { op, ...extra })
    .then(() => { if (note) m.show(note, true); store.changed(); }).catch((e) => { m.show(e.message, false); store.changed(); });
  const b = (title, op, extra, note, on = false) => html`<button class=${cx("dbg-btn press", on && "on")} onClick=${() => run(op, extra, note)}>${title}</button>`;
  return html`
    <button class="dbg-fab press" onClick=${() => setOpen(!open)} aria-label="Инженерное меню">🛠</button>
    ${open ? html`<div class="dbg-panel glass">
      <div class="dbg-head"><b>Инженерное меню</b><button class="dbg-x press" onClick=${() => setOpen(false)}>✕</button></div>
      <h5>Соперник · ничьи</h5>
      <div class="dbg-row">${b("Предложит в раунде", "draw_round")}${b("Предложит в матче", "draw_match")}</div>
      <div class="dbg-row">${b("На мою: да", "reply", { value: "accept" }, "", d.reply === "accept")}${b("нет", "reply", { value: "decline" }, "", d.reply === "decline")}${b("молчит", "reply", { value: "silent" }, "", d.reply === "silent")}</div>
      <div class="dbg-row">${b("Открыть мне ничью в раунде", "open_round_draw", {}, "Ничья в раунде открыта")}${b("+12 раундов", "rounds12", {}, "12 раундов добавлено")}</div>
      <h5>Соперник · поведение</h5>
      <div class="dbg-row">${b("Свернул", "away")}${b("Нет связи", "offline")}${b("Вернулся", "back")}</div>
      <div class="dbg-row">${b(d.idle ? "Бездействует ✓" : "Бездействует", "idle", {}, "", d.idle)}${b(d.unready ? "Не жмёт «Готов» ✓" : "Не жмёт «Готов»", "unready", {}, "", d.unready)}${b("Сдался", "resign")}</div>
      <h5>Я и время</h5>
      <div class="dbg-row">${b("Мой таймер сворачивания → 0", "hide_zero", {}, "Сверни и вернись")}${b("«Ты здесь?»", "here_check")}</div>
      <div class="dbg-row">${b("+15 с", "advance", { seconds: 15 })}${b("+60 с", "advance", { seconds: 60 })}${b("Зритель", "viewer")}</div>
      <h5>Окна-объяснения</h5>
      <div class="dbg-row wrap">${NOTICES.map(([code, title]) => b(title, "notice", { code }))}</div>
    </div>` : null}`;
}
