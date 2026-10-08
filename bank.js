/** База дел: загрузка и проверка data/cases.json. */
import { CONFIG } from "../config.js";

let bank = null;

export async function loadBank() {
  if (bank) return bank;
  const res = await fetch(CONFIG.CASES_URL, { cache: "no-cache" });
  if (!res.ok) throw new Error(`Не удалось загрузить базу дел (${res.status})`);
  const data = await res.json();
  const cases = (data.cases || []).filter(c =>
    c && typeof c.id === "string" && Array.isArray(c.options) && c.options.length >= 2 && c.question);
  if (!cases.length) throw new Error("База дел пуста или повреждена");
  bank = { cases, byId: new Map(cases.map(c => [c.id, c])), topics: data.topics || {} };
  return bank;
}

export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/** Порядок показа вариантов: перестановка индексов 0..n-1. */
export const optionOrder = n => shuffle([...Array(n).keys()]);
