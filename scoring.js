/** Правила подсчёта. Сервер считает так же (server/Code.gs → Score_), его результат — окончательный. */
import { CONFIG } from "../config.js";

export function pointsFor(correct, ms) {
  if (!correct) return 0;
  const limit = CONFIG.TIME_PER_CASE * 1000;
  const t = Math.min(Math.max(ms, CONFIG.MIN_ANSWER_MS), limit);
  return CONFIG.BASE_POINTS + Math.round(CONFIG.SPEED_BONUS * (limit - t) / limit);
}

const RANKS = [
  { min: 0.9, title: "Ведущий эксперт", note: "Заключения можно подписывать без правок.", mood: "happy" },
  { min: 0.7, title: "Эксперт", note: "Уверенно. Пара спорных выводов, но в целом — достойно.", mood: "happy" },
  { min: 0.4, title: "Специалист", note: "Базу вы знаете, но экспертизу я бы вам пока не доверил.", mood: "neutral" },
  { min: 0,   title: "Понятой", note: "Присутствовали, всё видели. Лекции стоит перечитать.", mood: "sad" },
];
export function rankFor(correct, total) {
  const ratio = total ? correct / total : 0;
  return RANKS.find(r => ratio >= r.min);
}
