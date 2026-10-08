/**
 * Связь с «лабораторией» — Google Apps Script (server/Code.gs).
 * Если таблица не подключена, все запросы обрабатывает demo-server.js прямо в браузере.
 * Все ошибки приходят как ApiError с кодом: NETWORK, OUTDATED, BLOCKED, AUTH, NO_BANK, ...
 */
import { CONFIG } from "../config.js";
import { storage, KEYS } from "./storage.js";
import { demoServer } from "./demo-server.js";

export class ApiError extends Error {
  constructor(code, message) { super(message); this.name = "ApiError"; this.code = code; }
}
/** Ошибки, после которых запрос имеет смысл повторить позже. */
export const isTransient = e => ["NETWORK", "BAD_RESPONSE", "OUTDATED"].includes(e?.code);

const LAB_RE = /^[A-Za-z0-9_-]{20,}$/;

export const lab = {
  id: () => storage.get(KEYS.LAB, ""),
  set(id) { storage.set(KEYS.LAB, id); },
  /** Игроки приходят по ссылке ?lab=… — запоминаем таблицу. */
  captureFromLocation() {
    const q = new URLSearchParams(location.search).get("lab");
    if (q && LAB_RE.test(q)) this.set(q);
  },
  /** Достаёт id из ссылки вида https://script.google.com/macros/s/ID/exec */
  parse(text) {
    const m = String(text).match(/\/macros\/s\/([A-Za-z0-9_-]{20,})\//);
    return m ? m[1] : null;
  },
  url() { return CONFIG.API_URL || (this.id() ? `https://script.google.com/macros/s/${this.id()}/exec` : ""); },
  isDemo() { return !this.url(); },
  siteUrl: () => location.origin + location.pathname.replace(/[^/]*$/, ""),
  shareLink() { return this.siteUrl() + (CONFIG.API_URL ? "" : "?lab=" + this.id()); },
};

async function remote(url, action, payload) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CONFIG.REQUEST_TIMEOUT_MS);
  let res;
  try {
    // text/plain (по умолчанию для строки) — «простой» запрос без preflight, Apps Script его принимает
    res = await fetch(url, { method: "POST", body: JSON.stringify({ ...payload, action, v: CONFIG.CLIENT_VERSION }), signal: ctrl.signal });
  } catch {
    throw new ApiError("NETWORK", "Нет связи с лабораторией. Проверьте интернет и попробуйте ещё раз.");
  } finally { clearTimeout(timer); }

  let data;
  try { data = await res.json(); }
  catch { throw new ApiError("BAD_RESPONSE", "Таблица ответила непонятно. Проверьте, что скрипт развёрнут с доступом «Все»."); }
  if (!data || !data.version || data.version < CONFIG.MIN_SERVER_VERSION)
    throw new ApiError("OUTDATED", "Код в Google Таблице устарел — руководителю нужно обновить его по инструкции.");
  if (!data.ok) throw new ApiError(data.code || "SERVER", data.error || "Ошибка сервера");
  return data;
}

/** opts.labId — проверить другую таблицу, ещё не сохраняя её (при подключении). */
export async function call(action, payload = {}, opts = {}) {
  if (opts.labId) return remote(`https://script.google.com/macros/s/${opts.labId}/exec`, action, payload);
  if (lab.isDemo()) {
    const data = await demoServer.handle(action, payload);
    if (!data.ok) throw new ApiError(data.code, data.error);
    return data;
  }
  return remote(lab.url(), action, payload);
}

/** Очередь для запросов, которые не ушли без интернета (сейчас — только завершение игры). */
export const outbox = {
  add(action, payload) {
    const q = storage.get(KEYS.OUTBOX, []);
    if (!q.some(x => x.action === action && x.payload?.attemptId === payload.attemptId)) q.push({ action, payload });
    storage.set(KEYS.OUTBOX, q);
  },
  size: () => storage.get(KEYS.OUTBOX, []).length,
  async flush() {
    const q = storage.get(KEYS.OUTBOX, []);
    if (!q.length) return;
    const rest = [];
    for (const item of q) {
      try {
        const data = await call(item.action, item.payload);
        const last = storage.get(KEYS.LAST_RESULT);
        if (item.action === "finish" && last?.attemptId === item.payload.attemptId)
          storage.set(KEYS.LAST_RESULT, { ...last, sent: true, server: pickResult(data) });
      } catch (e) { if (isTransient(e)) rest.push(item); }
    }
    storage.set(KEYS.OUTBOX, rest);
  },
};

export const pickResult = d => ({ score: d.score, correct: d.correct, total: d.total, title: d.title, duration: d.duration });
