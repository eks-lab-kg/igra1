/** Хранение незаконченной игры на устройстве. */
import { storage, KEYS } from "./storage.js";
import { lab } from "./api.js";

export const session = {
  load() {
    const s = storage.get(KEYS.SESSION);
    return s && s.lab === lab.id() && Array.isArray(s.deck) ? s : null;
  },
  save(s) { storage.set(KEYS.SESSION, s); },
  clear() { storage.remove(KEYS.SESSION); },
};
