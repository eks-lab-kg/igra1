/** Обёртка над localStorage: пространство имён, JSON, безопасность от ошибок. */
const PREFIX = "tse.v4.";

export const KEYS = Object.freeze({
  PLAYER: "player",           // последнее имя/группа/аватар на этом устройстве
  SESSION: "session",         // незаконченная игра (для продолжения после обновления)
  LAST_RESULT: "lastResult",  // результат последней игры и статус отправки
  OUTBOX: "outbox",           // запросы, которые не ушли из-за отсутствия сети
  LAB: "lab",                 // id подключённой таблицы
  ADMIN_TOKEN: "admin.token", // токен входа руководителя (не пароль!)
  ADMIN_CACHE: "admin.cache", // последние данные кабинета для мгновенного показа
  DEMO_DB: "demo.db",         // «сервер» демо-режима
});

export const storage = {
  get(key, fallback = null) {
    try { const v = localStorage.getItem(PREFIX + key); return v == null ? fallback : JSON.parse(v); }
    catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); return true; }
    catch { return false; }
  },
  remove(key) {
    try { localStorage.removeItem(PREFIX + key); } catch { /* ignore */ }
  },
};

/** Перенос данных из прошлых версий игры (однофайловой). */
export function migrateLegacy() {
  const read = k => { try { const v = localStorage.getItem(k); return v == null ? null : JSON.parse(v); } catch { return null; } };
  const lab = read("tse_lab");
  if (lab && !storage.get(KEYS.LAB)) storage.set(KEYS.LAB, lab);
  const player = read("tse_player");
  if (player && !storage.get(KEYS.PLAYER)) storage.set(KEYS.PLAYER, player);
  // Старый вход хранил сам пароль — удаляем его. Остальное несовместимо с новой версией.
  ["tse_lab", "tse_player", "tse_admin_key", "tse_admin_cache", "tse_admin_meta", "tse_progress", "tse_pending", "tse_local_results", "tse_local_meta"]
    .forEach(k => { try { localStorage.removeItem(k); } catch { /* ignore */ } });
}
