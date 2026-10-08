/**
 * Логика одной проверки — чистые функции без DOM и сети.
 * Состояние (session) сериализуется в localStorage, поэтому игру можно продолжить после обновления страницы.
 *
 * session = {
 *   lab, attemptId, player,
 *   deck: [{ id, order }],        // order — порядок показа вариантов (индексы в options)
 *   index,                        // номер текущего дела
 *   phase: "question" | "review", // отвечает / читает разбор
 *   questionStartedAt,            // когда показано текущее дело (мс)
 *   answers: [{ id, choice, ms, correct, points }],
 *   startedAt
 * }
 */
import { CONFIG } from "../config.js";
import { optionOrder } from "./bank.js";
import { pointsFor } from "./scoring.js";

export const TIMEOUT = -1;
const LIMIT_MS = () => CONFIG.TIME_PER_CASE * 1000;

export function createSession({ lab, attemptId, player, deckIds, bank, now = Date.now() }) {
  const deck = deckIds.filter(id => bank.byId.has(id)).map(id => ({ id, order: optionOrder(bank.byId.get(id).options.length) }));
  return { lab, attemptId, player, deck, index: 0, phase: "question", questionStartedAt: now, answers: [], startedAt: now };
}

export const currentItem = s => s.deck[s.index];
export const isComplete = s => s.answers.length >= s.deck.length;

export function remainingMs(s, now = Date.now()) {
  if (s.phase !== "question") return 0;
  return Math.max(0, LIMIT_MS() - (now - s.questionStartedAt));
}

/** choice — индекс в options (0 = правильный), либо TIMEOUT. */
export function answer(s, choice, now = Date.now()) {
  if (s.phase !== "question") return { session: s, result: s.answers[s.answers.length - 1] };
  const item = currentItem(s);
  const ms = Math.min(LIMIT_MS(), Math.max(0, now - s.questionStartedAt));
  const correct = choice === 0;
  const result = { id: item.id, choice, ms, correct, points: pointsFor(correct, ms) };
  return { session: { ...s, phase: "review", answers: [...s.answers, result] }, result };
}

export function next(s, now = Date.now()) {
  if (s.phase !== "review") return s;
  return { ...s, index: s.index + 1, phase: "question", questionStartedAt: now };
}

export function totals(s) {
  const score = s.answers.reduce((sum, a) => sum + a.points, 0);
  const correct = s.answers.filter(a => a.correct).length;
  return { score, correct, total: s.deck.length };
}

/** То, что уходит на сервер: только выбор и время, баллы сервер считает сам. */
export const answersPayload = s => s.answers.map(({ id, choice, ms }) => ({ id, choice, ms }));
