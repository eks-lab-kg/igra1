/**
 * Настройки игры. Обычно здесь ничего менять не нужно:
 * Google Таблица подключается прямо в кабинете руководителя.
 *
 * ВАЖНО: правила подсчёта баллов продублированы на сервере (server/Code.gs, объект CFG).
 * Если меняете TIME_PER_CASE, CASES_PER_GAME, BASE_POINTS, SPEED_BONUS или MIN_ANSWER_MS —
 * поменяйте их и там, иначе баллы в игре и в рейтинге будут расходиться.
 */
export const CONFIG = Object.freeze({
  API_URL: "",               // необязательно: ссылка на веб-приложение Apps Script
  TIME_PER_CASE: 40,         // секунд на одно дело
  CASES_PER_GAME: 17,        // сколько случайных дел достаётся игроку
  BASE_POINTS: 100,          // за верный ответ
  SPEED_BONUS: 50,           // максимум бонуса за скорость
  MIN_ANSWER_MS: 2000,       // быстрее этого бонус не растёт (защита от подделки времени)
  CLIENT_VERSION: 4,
  MIN_SERVER_VERSION: 4,     // если код в таблице старее — попросим его обновить
  CASES_URL: "data/cases.json",
  REQUEST_TIMEOUT_MS: 20000,
});
