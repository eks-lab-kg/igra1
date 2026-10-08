/**
 * Демо-режим: тот же протокол, что у server/Code.gs, но данные хранятся в браузере.
 * Нужен, чтобы попробовать игру и кабинет до подключения Google Таблицы.
 */
import { CONFIG } from "../config.js";
import { storage, KEYS } from "./storage.js";
import { loadBank, shuffle } from "./bank.js";
import { playerKey } from "./identity.js";
import { pointsFor, rankFor } from "./scoring.js";

const VERSION = 5;
const db = () => storage.get(KEYS.DEMO_DB, { attempts: [], extra: {}, all: 0 });
const save = d => storage.set(KEYS.DEMO_DB, d);
const fail = (code, error) => ({ ok: false, code, error });
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 10);

const handlers = {
  ping: () => ({}),

  async start({ name, group, avatar }) {
    const d = db(), key = playerKey({ name, group });
    const used = d.attempts.filter(a => a.key === key).length;
    if (used >= 1 + (d.extra[key] || 0) + d.all) return fail("BLOCKED", "Вы уже проходили проверку.");
    const bank = await loadBank();
    const deck = shuffle(bank.cases.map(c => c.id)).slice(0, CONFIG.CASES_PER_GAME);
    const attempt = { id: uid(), key, name, group, avatar, deck, status: "started", startedAt: Date.now(),
      date: new Date().toISOString(), score: 0, correct: 0, total: deck.length, duration: 0, title: "", answers: "" };
    d.attempts.push(attempt); save(d);
    return { attemptId: attempt.id, deck };
  },

  finish({ attemptId, answers }) {
    const d = db(), a = d.attempts.find(x => x.id === attemptId);
    if (!a) return fail("NOT_FOUND", "Попытка не найдена");
    if (a.status !== "done") {
      if (!Array.isArray(answers) || answers.length !== a.deck.length || answers.some((x, i) => x.id !== a.deck[i]))
        return fail("BAD_ANSWERS", "Ответы не совпадают с выданными делами");
      const scored = answers.map(x => ({ id: x.id, correct: x.choice === 0, points: pointsFor(x.choice === 0, x.ms) }));
      a.correct = scored.filter(x => x.correct).length;
      a.score = scored.reduce((s, x) => s + x.points, 0);
      a.duration = Math.round((Date.now() - a.startedAt) / 1000);
      a.title = rankFor(a.correct, a.total).title;
      a.answers = scored.map(x => `${x.id}:${x.correct ? 1 : 0}`).join(",");
      a.status = "done"; save(d);
    }
    return { score: a.score, correct: a.correct, total: a.total, title: a.title, duration: a.duration };
  },

  top: () => ({ rows: db().attempts.filter(a => a.status === "done").map(publicRow) }),
  login: () => { const d = db(); return { token: "demo", first: false, rows: d.attempts.map(adminRow), extra: d.extra, all: d.all }; },
  list: () => { const d = db(); return { rows: d.attempts.map(adminRow), extra: d.extra, all: d.all }; },
  grant({ name, group }) { const d = db(), k = playerKey({ name, group }); d.extra[k] = (d.extra[k] || 0) + 1; save(d); return { extra: d.extra, all: d.all }; },
  grantAll() { const d = db(); d.all += 1; save(d); return { extra: d.extra, all: d.all }; },
  logoutAll: () => ({}),
};

const publicRow = a => ({ name: a.name, group: a.group, avatar: a.avatar, score: a.score, correct: a.correct, total: a.total, duration: a.duration, title: a.title });
const adminRow = a => ({ ...publicRow(a), id: a.id, date: a.date, status: a.status, answers: a.answers });

export const demoServer = {
  async handle(action, payload) {
    const h = handlers[action];
    if (!h) return fail("UNKNOWN_ACTION", "Неизвестное действие");
    const res = await h(payload);
    return res && res.ok === false ? res : { ok: true, version: VERSION, ...res };
  },
};
