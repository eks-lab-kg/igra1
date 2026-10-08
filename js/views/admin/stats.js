/** Чистые расчёты для кабинета: таблица игроков, попытки, трудные дела, темы. */
import { playerKey } from "../../core/identity.js";
import { bestPerPlayer, sortAttempts } from "../../core/ranking.js";

export function buildDashboard({ rows = [], extra = {}, all = 0 }, { group, bestOnly }, bank) {
  const groups = [...new Set(rows.map(r => String(r.group ?? "").trim()))].filter(Boolean).sort();
  const scoped = rows.filter(r => !group || String(r.group).trim() === group).map(r => ({ ...r, status: r.status || "done" }));
  const done = scoped.filter(r => r.status !== "started");

  const used = {};
  scoped.forEach(r => { const k = playerKey(r); used[k] = (used[k] || 0) + 1; });
  const allowed = k => 1 + (extra[k] || 0) + (all || 0);

  let place = 0;
  const table = (bestOnly ? bestPerPlayer(scoped, { includeStarted: true }) : sortAttempts(scoped)).map(r => {
    const k = playerKey(r);
    return { ...r, place: r.status === "started" ? null : ++place, used: used[k] || 0, allowed: allowed(k) };
  });

  const leaders = bestPerPlayer(done);
  const avg = leaders.length ? Math.round(leaders.reduce((s, r) => s + r.score, 0) / leaders.length) : 0;

  // Статистика по делам и темам — по всем завершённым попыткам
  const perCase = new Map();
  done.forEach(r => String(r.answers || "").split(",").forEach(x => {
    const [id, v] = x.split(":"); if (!id) return;
    const s = perCase.get(id) || { n: 0, ok: 0 }; s.n++; if (v === "1") s.ok++; perCase.set(id, s);
  }));
  const hardest = [...perCase].filter(([id, s]) => s.n >= 2 && bank.byId.has(id))
    .map(([id, s]) => ({ title: bank.byId.get(id).title, n: s.n, pct: Math.round(100 * s.ok / s.n) }))
    .sort((a, b) => a.pct - b.pct || b.n - a.n).slice(0, 10);

  const perTopic = {};
  perCase.forEach((s, id) => {
    const t = bank.byId.get(id)?.topic; if (!t) return;
    perTopic[t] = perTopic[t] || { n: 0, ok: 0 }; perTopic[t].n += s.n; perTopic[t].ok += s.ok;
  });
  const topics = Object.entries(perTopic).map(([t, s]) => ({ title: bank.topics[t] || t, n: s.n, pct: Math.round(100 * s.ok / s.n) }))
    .sort((a, b) => a.pct - b.pct);

  return { groups, table, leaders, players: Object.keys(used).length, attempts: scoped.length, avg, hardest, topics, all };
}

export function toCsv(table) {
  const head = ["Место", "Имя", "Группа", "Баллы", "Верно", "Всего", "Время, с", "Звание", "Статус", "Попытки", "Дата"];
  const lines = [head, ...table.map(r => [r.place ?? "", r.name, r.group, r.score, r.correct, r.total, r.duration, r.title || "",
    r.status === "started" ? "не завершена" : "завершена", `${r.used} из ${r.allowed}`, r.date])];
  return "\ufeff" + lines.map(l => l.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(";")).join("\r\n");
}
