/** Вход руководителя и кэш кабинета. Храним токен (не пароль), привязанный к таблице. */
import { storage, KEYS } from "../../core/storage.js";
import { lab } from "../../core/api.js";

const labKey = () => lab.isDemo() ? "demo" : lab.url();

export const auth = {
  token() { const t = storage.get(KEYS.ADMIN_TOKEN); return t && t.lab === labKey() ? t.token : null; },
  save(token) { storage.set(KEYS.ADMIN_TOKEN, { token, lab: labKey() }); },
  clear() { storage.remove(KEYS.ADMIN_TOKEN); storage.remove(KEYS.ADMIN_CACHE); },
};

export const cache = {
  get() { const c = storage.get(KEYS.ADMIN_CACHE); return c && c.lab === labKey() ? c : null; },
  save(data) { storage.set(KEYS.ADMIN_CACHE, { ...data, lab: labKey(), at: Date.now() }); },
};

/** Настройки просмотра — живут, пока открыта вкладка. */
export const view = { group: "", bestOnly: true, demoChosen: false, flash: "" };
