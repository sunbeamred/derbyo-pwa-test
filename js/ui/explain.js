// Why a round or a match ended, when the board does not say it: the server sends a code once (state.endNotice),
// and the side it concerns gets a short window. «Понял» unlocks 3 s after the window is actually on screen.
import { html, useState, useEffect, Alert } from "./common.js";
import { store } from "../model.js";

const TEXTS = {
  away: ["Время вне игры истекло", "Игра была свёрнута дольше допустимого. Раунд засчитан сопернику."],
  offline: ["Соединение потеряно", "Ты не вернулся в игру за 60 секунд. Раунд засчитан сопернику."],
  idle: ["Нет действий", "Два хода подряд без действий. Соперник покинул матч с победой."],
  ready: ["Готовность не подтверждена", "Ты не подтвердил готовность в течение минуты. Победа в матче засчитана сопернику."],
  stopped: ["Матч остановлен", "Никто не продолжил игру за 3 минуты. Матч не засчитан, сыгранные раунды остаются в рейтинге."],
};
const SEEN_KEY = "derbyo-notices-seen";
const seen = () => { try { return JSON.parse(localStorage.getItem(SEEN_KEY)) ?? []; } catch { return []; } };
const markSeen = (id) => { try { localStorage.setItem(SEEN_KEY, JSON.stringify([...seen(), id].slice(-30))); } catch {} };

/** The notice for this player, or null: not for spectators or two on one phone, and each one only once. */
export function noticeFor(m) {
  const n = m.endNotice;
  if (!n || !TEXTS[n.code] || m.watching || m.hotseat) return null;
  if (n.seat !== null && n.seat !== m.serverSeat) return null;
  return seen().includes(n.id) ? null : n;
}

export function Explainer({ notice }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    // Counted from when the screen is visible: a window that pops up while the app is minimised does not unlock early.
    let timer = null;
    const arm = () => { clearTimeout(timer); if (!document.hidden) timer = setTimeout(() => setReady(true), 3000); };
    arm(); document.addEventListener("visibilitychange", arm);
    return () => { clearTimeout(timer); document.removeEventListener("visibilitychange", arm); };
  }, [notice.id]);
  const [title, text] = TEXTS[notice.code];
  const ok = () => { markSeen(notice.id); store.changed(); };
  return html`<${Alert} title=${title} message=${text} actions=${[{ title: "Понял", disabled: !ready, run: ok }]} />`;
}
