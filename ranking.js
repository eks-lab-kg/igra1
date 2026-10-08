/** Рейтинг: у каждого игрока учитывается лучшая завершённая попытка; при равенстве — кто быстрее. */
import { playerKey } from "./identity.js";

const num = r => ({ ...r, score: +r.score || 0, correct: +r.correct || 0, total: +r.total || 0, duration: +r.duration || 0, avatar: +r.avatar || 0, status: r.status || "done" });
const byScore = (a, b) => b.score - a.score || a.duration - b.duration;

export function bestPerPlayer(rows, { includeStarted = false } = {}) {
  const best = new Map();
  for (const r0 of rows) {
    const r = num(r0);
    if (r.status === "started" && !includeStarted) continue;
    const k = playerKey(r), p = best.get(k);
    const better = !p
      || (p.status === "started" && r.status !== "started")
      || (p.status === r.status && byScore(r, p) < 0);
    if (better) best.set(k, r);
  }
  return [...best.values()].sort((a, b) => (a.status === "started") - (b.status === "started") || byScore(a, b));
}

export const sortAttempts = rows => rows.map(num).sort((a, b) => (a.status === "started") - (b.status === "started") || byScore(a, b));
