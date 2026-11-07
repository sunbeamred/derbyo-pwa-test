// Why a round or a match ended, when the board does not say it: the server sends a code once (state.endNotice),
// and the side it concerns gets a short window. «Понял» unlocks 3 s after the window is actually on screen.
import { html, useState, useEffect, Alert } from "./common.js";
import { store } from "../model.js";

// [title, text, tone]: red for a loss, gold for a warning (owner, 2026-11-06).
const TEXTS = {
  away: ["Время вне игры истекло", "Игра была свёрнута дольше допустимого. Раунд засчитан сопернику.", "loss"],
  spent: ["Запас времени вне игры исчерпан", "Ход передан сопернику. Теперь в этом матче на каждое сворачивание есть только 5 секунд, в противном случае победа в раунде будет засчитана сопернику.", "warn"],
  offline: ["Соединение потеряно", "Связь не восстановилась за 60 секунд. Раунд засчитан сопернику.", "loss"],
  idle: ["Активность не подтверждена", "Два хода подряд без действий. Соперник покинул матч, победа засчитана ему.", "loss"],
  gone: ["Техническое поражение", "Возврата в игру не было в течение минуты после раунда. Победа в матче засчитана сопернику.", "loss"],
  ready: ["Техническое поражение", "Готовность не подтверждена в течение минуты. Победа в матче засчитана сопернику.", "loss"],
  stopped: ["Матч остановлен", "Никто не продолжил игру за 3 минуты. Матч не засчитан, сыгранные раунды остаются в рейтинге.", "warn"],
};
const SEEN_KEY = "derbyo-notices-seen";
const seen = () => { try { return JSON.parse(localStorage.getItem(SEEN_KEY)) ?? []; } catch { return []; } };
const markSeen = (id) => { try { localStorage.setItem(SEEN_KEY, JSON.stringify([...seen(), id].slice(-30))); } catch {} };

/** The notice for this player, or null: not for spectators or two on one phone, and each one only once. */
export function noticeFor(m) {
  const n = m.endNotice;
  if (!n || !TEXTS[n.code] || m.watching || m.hotseat || m.stale) return null;
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
  const [title, text, tone] = TEXTS[notice.code];
  const ok = () => { markSeen(notice.id); store.changed(); };
  return html`<${Alert} title=${title} tone=${tone} message=${text} actions=${[{ title: "Понял", disabled: !ready, run: ok }]} />`;
}
