/**
 * «Экспертная лаборатория» — сервер (Google Apps Script), версия 4.
 * Ничего менять не нужно: вставьте весь текст в Расширения → Apps Script и разверните.
 *
 * Что делает сервер:
 *  - выдаёт каждому игроку случайный набор дел и следит за лимитом попыток;
 *  - сам считает баллы по ответам (подделать итоговый балл нельзя);
 *  - хранит результаты в листе «Результаты»;
 *  - пускает в кабинет по сессии (случайный ключ на сервере), пароль хранит только в виде хэша.
 *
 * Протокол: POST с JSON { action, ...параметры } → { ok, version, ... } или { ok:false, code, error }.
 */

const VERSION = 5;

// Правила игры — должны совпадать с js/config.js
const CFG = {
  SHEET: 'Результаты',
  PER_GAME: 17,
  TIME_MS: 40000,
  MIN_MS: 2000,
  BASE: 100,
  BONUS: 50,
  TOKEN_DAYS: 30,
  BANK_PATH: 'data/cases.json',
  MAX_LOGIN_FAILS: 10,
};

// Колонки листа (ищутся по названию — порядок не важен, недостающие добавятся сами)
const COL = {
  date: 'Дата', name: 'Имя', group: 'Группа', score: 'Баллы', correct: 'Верно', total: 'Всего',
  duration: 'Время, с', title: 'Звание', avatar: 'Аватар', answers: 'Ответы', id: 'ID попытки',
  status: 'Статус', deck: 'Колода', startedAt: 'Начало, мс',
};
const STATUS = { STARTED: 'не завершена', DONE: 'завершена' };

/* ============================== Вход ============================== */

function doPost(e) {
  let req;
  try { req = JSON.parse(e.postData.contents); }
  catch (_) { return json_({ ok: false, version: VERSION, code: 'BAD_REQUEST', error: 'Неверный запрос' }); }

  const handler = HANDLERS[req.action];
  if (!handler) return json_({ ok: false, version: VERSION, code: 'UNKNOWN_ACTION', error: 'Неизвестное действие' });

  try {
    const res = handler(req) || {};
    res.ok = true; res.version = VERSION;
    return json_(res);
  } catch (err) {
    if (err && err.isApp) return json_({ ok: false, version: VERSION, code: err.code, error: err.message });
    console.error(err);
    return json_({ ok: false, version: VERSION, code: 'SERVER', error: 'Ошибка сервера: ' + (err && err.message) });
  }
}

function doGet() { return json_({ ok: true, version: VERSION, message: 'Сервер игры работает' }); }

function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function fail_(code, message) { const e = new Error(message); e.code = code; e.isApp = true; return e; }

/* ============================== Действия ============================== */

const HANDLERS = {
  ping: function () { return {}; },

  /** Начать проверку: проверка лимита попыток, выдача случайных дел. */
  start: function (req) {
    const p = player_(req);
    return withLock_(function () {
      const k = key_(p.name, p.group);
      const used = Repo.all().filter(function (a) { return key_(a.name, a.group) === k; }).length;
      if (used >= Limits.allowed(k)) throw fail_('BLOCKED', 'Вы уже проходили проверку.');
      const deck = shuffle_(Bank.ids()).slice(0, CFG.PER_GAME);
      const id = Utilities.getUuid();
      Repo.append({
        date: new Date(), name: p.name, group: p.group, avatar: p.avatar, score: 0, correct: 0, total: deck.length,
        duration: 0, title: '', answers: '', id: id, status: STATUS.STARTED, deck: deck.join(','), startedAt: Date.now(),
      });
      return { attemptId: id, deck: deck };
    });
  },

  /** Завершить проверку: сервер сам проверяет ответы и считает баллы. */
  finish: function (req) {
    return withLock_(function () {
      const found = Repo.findById(String(req.attemptId || ''));
      if (!found) throw fail_('NOT_FOUND', 'Попытка не найдена');
      const a = found.attempt;
      if (a.status === STATUS.DONE) return publicResult_(a);

      const deck = String(a.deck || '').split(',').filter(String);
      const answers = Array.isArray(req.answers) ? req.answers : [];
      if (!deck.length || answers.length !== deck.length || answers.some(function (x, i) { return !x || x.id !== deck[i]; }))
        throw fail_('BAD_ANSWERS', 'Ответы не совпадают с выданными делами');

      const scored = answers.map(function (x) {
        const ok = Number(x.choice) === 0; // в базе правильный вариант всегда первый
        return { id: x.id, ok: ok, points: Score_.points(ok, Number(x.ms)) };
      });
      const correct = scored.filter(function (x) { return x.ok; }).length;
      const score = scored.reduce(function (s, x) { return s + x.points; }, 0);
      const startedAt = Number(a.startedAt) || Date.now();
      const update = {
        score: score, correct: correct, total: deck.length,
        duration: Math.round((Date.now() - startedAt) / 1000),
        title: Score_.rank(correct, deck.length),
        answers: scored.map(function (x) { return x.id + ':' + (x.ok ? 1 : 0); }).join(','),
        status: STATUS.DONE,
      };
      Repo.update(found.row, update);
      return publicResult_(Object.assign({}, a, update));
    });
  },

  /** Публичный рейтинг — только завершённые попытки и только открытые поля. */
  top: function () {
    return { rows: Repo.all().filter(isDone_).map(function (a) {
      return { name: a.name, group: a.group, avatar: a.avatar, score: a.score, correct: a.correct, total: a.total, duration: a.duration, title: a.title };
    }) };
  },

  /** Вход руководителя. Первый вход задаёт пароль. Заодно запоминаем адрес сайта (там лежит база дел). */
  login: function (req) {
    const res = Auth.login(String(req.password || ''));
    const site = String(req.siteUrl || '');
    if (/^https:\/\/[^\s"'<>]+\/$/.test(site)) { props_().setProperty('SITE_URL', site); Bank.reset(); }
    return Object.assign(res, adminData_()); // сразу отдаём данные кабинета — второй запрос не нужен
  },

  list: function (req) {
    Auth.verify(req.token);
    return adminData_();
  },

  grant: function (req) {
    Auth.verify(req.token);
    const p = player_(req);
    return withLock_(function () { Limits.grant(key_(p.name, p.group)); return { extra: Limits.extra(), all: Limits.all() }; });
  },

  grantAll: function (req) {
    Auth.verify(req.token);
    return withLock_(function () { Limits.grantAll(); return { extra: Limits.extra(), all: Limits.all() }; });
  },

  logoutAll: function (req) { Auth.verify(req.token); Auth.rotate(); return {}; },
};

/* ============================== Модули ============================== */

/** Лист с результатами. Колонки находятся по заголовкам. */
const Repo = {
  sheet: function () {
    if (this._sheet) return this._sheet;
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sh = ss.getSheetByName(CFG.SHEET);
    if (!sh) { sh = ss.insertSheet(CFG.SHEET); sh.setFrozenRows(1); }
    const lastCol = Math.max(sh.getLastColumn(), 1);
    const header = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
    const missing = Object.keys(COL).map(function (k) { return COL[k]; }).filter(function (h) { return header.indexOf(h) < 0; });
    if (missing.length) {
      const start = header.filter(String).length + 1;
      sh.getRange(1, start, 1, missing.length).setValues([missing]);
    }
    this._sheet = sh;
    return sh;
  },
  index: function () {
    if (this._index) return this._index;
    const sh = this.sheet();
    const header = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
    const idx = {};
    Object.keys(COL).forEach(function (k) { idx[k] = header.indexOf(COL[k]); });
    this._index = idx; this._width = header.length;
    return idx;
  },
  toObj_: function (row) {
    const idx = this.index(), o = {};
    Object.keys(idx).forEach(function (k) { o[k] = idx[k] >= 0 ? row[idx[k]] : ''; });
    return o;
  },
  all: function () {
    const sh = this.sheet(), last = sh.getLastRow();
    this.index();
    if (last < 2) return [];
    const self = this;
    return sh.getRange(2, 1, last - 1, this._width).getValues()
      .filter(function (r) { return String(r[self._index.name]).trim(); })
      .map(function (r) { return self.toObj_(r); });
  },
  append: function (obj) {
    const idx = this.index(), row = new Array(this._width).fill('');
    Object.keys(obj).forEach(function (k) { if (idx[k] >= 0) row[idx[k]] = cell_(obj[k]); });
    this.sheet().appendRow(row);
  },
  findById: function (id) {
    if (!id) return null;
    const idx = this.index();
    const col = idx.id + 1;
    const cell = this.sheet().getRange(2, col, Math.max(this.sheet().getLastRow() - 1, 1), 1)
      .createTextFinder(id).matchEntireCell(true).findNext();
    if (!cell) return null;
    const row = cell.getRow();
    return { row: row, attempt: this.toObj_(this.sheet().getRange(row, 1, 1, this._width).getValues()[0]) };
  },
  update: function (rowNum, obj) {
    const idx = this.index(), sh = this.sheet();
    Object.keys(obj).forEach(function (k) { if (idx[k] >= 0) sh.getRange(rowNum, idx[k] + 1).setValue(cell_(obj[k])); });
  },
};

/** База дел лежит на сайте игры (data/cases.json). Серверу нужны только id дел. */
const Bank = {
  ids: function () {
    const cache = CacheService.getScriptCache();
    const cached = cache.get('bank.ids');
    if (cached) return JSON.parse(cached);
    const site = props_().getProperty('SITE_URL');
    if (!site) throw fail_('NO_BANK', 'Игра ещё не готова: руководителю нужно один раз войти в кабинет.');
    const res = UrlFetchApp.fetch(site + CFG.BANK_PATH, { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) throw fail_('NO_BANK', 'Не удалось загрузить базу дел с сайта игры. Попробуйте позже.');
    const ids = (JSON.parse(res.getContentText()).cases || []).map(function (c) { return c.id; }).filter(String);
    if (!ids.length) throw fail_('NO_BANK', 'База дел пуста.');
    cache.put('bank.ids', JSON.stringify(ids), 600); // 10 минут
    return ids;
  },
  reset: function () { CacheService.getScriptCache().remove('bank.ids'); },
};

/** Лимит попыток: 1 по умолчанию + персональные разрешения + общие разрешения. */
const Limits = {
  extra: function () { try { return JSON.parse(props_().getProperty('EXTRA') || '{}'); } catch (_) { return {}; } },
  all: function () { return Number(props_().getProperty('ALL')) || 0; },
  allowed: function (k) { return 1 + (this.extra()[k] || 0) + this.all(); },
  grant: function (k) { const ex = this.extra(); ex[k] = (ex[k] || 0) + 1; props_().setProperty('EXTRA', JSON.stringify(ex)); },
  grantAll: function () { props_().setProperty('ALL', String(this.all() + 1)); },
};

/** Пароль хранится как соль + SHA-256. Вход выдаёт случайный ключ сессии на CFG.TOKEN_DAYS дней,
 *  список сессий лежит в свойствах скрипта. */
const Auth = {
  login: function (password) {
    const p = props_(), cache = CacheService.getScriptCache();
    const fails = Number(cache.get('login.fails')) || 0;
    if (fails >= CFG.MAX_LOGIN_FAILS) throw fail_('RATE', 'Слишком много неверных попыток. Подождите 10 минут.');

    // переход со старой версии, где пароль хранился как есть
    const legacy = p.getProperty('PW');
    if (legacy && !p.getProperty('PW_HASH')) { this.setPassword_(legacy); p.deleteProperty('PW'); }

    let first = false;
    if (!p.getProperty('PW_HASH')) {
      if (password.length < 4) throw fail_('WEAK', 'Придумайте пароль хотя бы из 4 символов.');
      this.setPassword_(password); first = true;
    } else if (this.hash_(password, p.getProperty('PW_SALT')) !== p.getProperty('PW_HASH')) {
      cache.put('login.fails', String(fails + 1), 600);
      Utilities.sleep(300);
      throw fail_('BAD_PASSWORD', 'Неверный пароль.');
    }
    cache.remove('login.fails');
    return { token: this.issue_(), first: first };
  },
  verify: function (token) {
    token = String(token || '');
    if (!token) throw fail_('AUTH', 'Нужно войти в кабинет.');
    const exp = this.sessions_()[token];
    if (!exp) throw fail_('AUTH', 'Сессия не найдена — войдите снова.');
    if (exp < Date.now()) throw fail_('AUTH', 'Сессия истекла — войдите снова.');
  },
  rotate: function () { props_().deleteProperty('SESSIONS'); },
  sessions_: function () { try { return JSON.parse(props_().getProperty('SESSIONS') || '{}'); } catch (_) { return {}; } },
  issue_: function () {
    const now = Date.now(), all = this.sessions_(), keep = {};
    // храним не больше 20 живых сессий
    Object.keys(all).filter(function (t) { return all[t] > now; })
      .sort(function (a, b) { return all[b] - all[a]; }).slice(0, 19)
      .forEach(function (t) { keep[t] = all[t]; });
    const token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
    keep[token] = now + CFG.TOKEN_DAYS * 864e5;
    props_().setProperty('SESSIONS', JSON.stringify(keep));
    return token;
  },
  setPassword_: function (pw) {
    const salt = Utilities.getUuid();
    props_().setProperties({ PW_SALT: salt, PW_HASH: this.hash_(pw, salt) });
  },
  hash_: function (pw, salt) {
    return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + '|' + pw, Utilities.Charset.UTF_8));
  },
};

/** Подсчёт баллов — так же, как в js/core/scoring.js. */
const Score_ = {
  points: function (ok, ms) {
    if (!ok) return 0;
    const t = Math.min(Math.max(isFinite(ms) ? ms : CFG.TIME_MS, CFG.MIN_MS), CFG.TIME_MS);
    return CFG.BASE + Math.round(CFG.BONUS * (CFG.TIME_MS - t) / CFG.TIME_MS);
  },
  rank: function (correct, total) {
    const r = total ? correct / total : 0;
    return r >= 0.9 ? 'Ведущий эксперт' : r >= 0.7 ? 'Эксперт' : r >= 0.4 ? 'Специалист' : 'Понятой';
  },
};

/* ============================== Помощники ============================== */

function adminData_() {
  return {
    rows: Repo.all().map(function (a) {
      return {
        id: a.id, date: a.date instanceof Date ? a.date.toISOString() : String(a.date), name: a.name, group: a.group,
        avatar: a.avatar, score: a.score, correct: a.correct, total: a.total, duration: a.duration, title: a.title,
        answers: a.answers, status: isDone_(a) ? 'done' : 'started',
      };
    }),
    extra: Limits.extra(), all: Limits.all(),
  };
}

function props_() { return PropertiesService.getScriptProperties(); }
function withLock_(fn) { const lock = LockService.getScriptLock(); lock.waitLock(15000); try { return fn(); } finally { lock.releaseLock(); } }
function norm_(s) { return String(s == null ? '' : s).toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim(); }
function key_(name, group) { return norm_(name) + '|' + norm_(group); }
function isDone_(a) { return a.status !== STATUS.STARTED; } // старые записи без статуса считаются завершёнными
function publicResult_(a) { return { score: Number(a.score) || 0, correct: Number(a.correct) || 0, total: Number(a.total) || 0, duration: Number(a.duration) || 0, title: a.title }; }
function shuffle_(arr) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
/** Текст из браузера не должен превратиться в формулу таблицы. */
function cell_(v) { return typeof v === 'string' ? v.replace(/^[=+\-@]/, "'$&") : v; }
function player_(req) {
  const name = String(req.name || '').trim().replace(/\s+/g, ' ').slice(0, 60);
  const group = String(req.group || '').trim().replace(/\s+/g, ' ').toUpperCase().slice(0, 30);
  if (name.length < 3 || !group) throw fail_('BAD_PLAYER', 'Укажите фамилию, имя и группу.');
  return { name: name, group: group, avatar: Math.max(0, Math.min(20, Math.round(Number(req.avatar)) || 0)) };
}

/* ============================== Обслуживание ============================== */

// Забыли пароль: выберите resetPassword в списке функций сверху и нажмите «Выполнить».
// После этого в кабинете можно придумать новый. Все устройства будут разлогинены.
function resetPassword() {
  ['PW', 'PW_HASH', 'PW_SALT', 'SECRET'].forEach(function (k) { props_().deleteProperty(k); });
  Auth.rotate();
}
